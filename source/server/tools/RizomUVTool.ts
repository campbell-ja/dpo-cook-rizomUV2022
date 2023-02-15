/**
 * 3D Foundation Project
 * Copyright 2019 Smithsonian Institution
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as path from "path";

import uniqueId from "../utils/uniqueId";

import Tool, { IToolSettings, IToolSetup, ToolInstance } from "../app/Tool";

////////////////////////////////////////////////////////////////////////////////

export interface IRizomUVToolSettings extends IToolSettings
{
    inputMeshFile: string;
    outputMeshFile: string;
    saveObj?: boolean;
    saveFbx?: boolean;
    saveCollada?: boolean;
    cutSegmentationStrength?: number;
    cutHandles?: boolean;
    rizomIterations?: number;
    rizomNoTriangleFlips?: boolean;
    rizomNoBorderIntersections?: boolean;
    packResolution?: number;
    packMutations?: number;
    packMargin?: number;
    packSpacing?: number;
    packRotateMin?: number;
    packRotateMax?: number;
    packRotateStep?: number;
}

export type RizomUVInstance = ToolInstance<RizomUVTool, IRizomUVToolSettings>;

export default class RizomUVTool extends Tool<RizomUVTool, IRizomUVToolSettings>
{
    static readonly toolName = "RizomUV";

    protected static readonly defaultOptions: Partial<IRizomUVToolSettings> = {
        cutSegmentationStrength: 0.65,
        cutHandles: false,
        rizomIterations: 5,
        rizomNoTriangleFlips: true,
        rizomNoBorderIntersections: true,
        packResolution: 500,
        packMutations: 1,
        packMargin: 2/1024,
        packSpacing: 4/1024,
        packRotateMin: 0,
        packRotateMax: 180,
        packRotateStep: 30
    };

    async setupInstance(instance: RizomUVInstance): Promise<IToolSetup>
    {
        const settings = instance.settings;

        const inputFilePath = instance.getFilePath(settings.inputMeshFile);
        if (!inputFilePath) {
            throw new Error("missing input mesh file");
        }

        const outputFilePath = instance.getFilePath(settings.outputMeshFile);
        if (!outputFilePath) {
            throw new Error("missing output mesh file");
        }

        const outputFileExt = path.extname(outputFilePath);
        const outputFileBase = outputFilePath.substring(0, outputFilePath.length - outputFileExt.length);

        const saveOperations = [];

        if (outputFileExt === ".obj" || settings.saveObj) {
            saveOperations.push(`ZomSave({File={Path=${JSON.stringify(outputFileBase + ".obj")}, UVWProps=true, FBX={FormatDescriptor="Alias OBJ (*.obj)"}}, __UpdateUIObjFileName=true})`);
        }
        if (outputFileExt === ".fbx" || settings.saveFbx) {
            saveOperations.push(`ZomSave({File={Path=${JSON.stringify(outputFileBase + ".fbx")}, UVWProps=true, FBX={FormatDescriptor="FBX binary (*.fbx)"}}, __UpdateUIObjFileName=true})`);
        }
        if (outputFileExt === ".dae" || settings.saveCollada) {
            saveOperations.push(`ZomSave({File={Path=${JSON.stringify(outputFileBase + ".dae")}, UVWProps=true, FBX={FormatDescriptor="Collada DAE (*.dae)"}}, __UpdateUIObjFileName=true})`);
        }

        if (saveOperations.length === 0) {
            throw new Error("no save operation specified, result won't be saved");
        }

        const content = [
            `ZomResetPrefs(none)`,
                
            `-- RizomUV2022 load file -- `,
            `ZomLoad({File={Path=${JSON.stringify(inputFilePath)}, ImportGroups=true, XYZ=true}, NormalizeUVW=true, __Focus=true})`,

            `-- RizomUV2022 Auto Select Edges --`,
            `ZomSelect({PrimType="Edge", WorkingSet="Island", IslandGroupMode="Group", Select=true, ResetBefore=true, ProtectMapName="Protect", FilterIslandVisible=true, Auto={QuasiDevelopable={Developability=${settings.cutSegmentationStrength}, IslandPolyNBMin=1, FitCones=false, Straighten=true}, HandleCutter=true, QuadLoopCutter=true, StretchLimiter=true, Quality=0.25, SQS=0.0357143, SQP=0.5, AQS=0.000178571, AQP=0.5}})`,
            
            `-- RizomUV2022 Unwrap and Unfold Islands -- `,
            `ZomCut({PrimType="Edge", WorkingSet="Island"})`,
            `ZomUnfold({PrimType="Edge", PreIterations=5, Iterations=5, TriangleFlips=true, ProcessNonFlats=true, RoomSpace=0, MinAngle=1e-05, BorderIntersections=true, ProcessJustCut=true, ProcessAllIfNoneSelected=true, ProcessSelection=true, PinMapName="Pin", StopIfOutOFDomain=false, Mix=1})`,
            
            `-- RizomUV2022 Set Packing and Island Group Settings --`,
            `ZomIslandGroups({Mode="SetGroupsProperties", WorkingSet="Visible", GroupPaths={ "RootGroup" }, Properties={Pack={Rotate={Mode=4}}}})`,
            `ZomIslandGroups({Mode="SetGroupsProperties", WorkingSet="Visible", GroupPaths={ "RootGroup" }, Properties={Pack={MarginSize=0.00195312}}})`,
            `ZomIslandGroups({Mode="SetGroupsProperties", WorkingSet="Visible", GroupPaths={ "RootGroup" }, Properties={Pack={PaddingSize=0.00390625}}})`,
            `ZomIslandGroups({Mode="DistributeInTilesByBBox", MergingPolicy=8322})`,
            `ZomIslandGroups({UseTileLocks=true, UseIslandLocks=true, Mode="DistributeInTilesEvenly", MergingPolicy=8322})`,

            `-- RizomUV2022 Pack Islands --`,
            `ZomPack({Resolution=512, RecursionDepth=1, Rotate={Min=0, Max=180, Step=30}, ProcessTileSelection=false, Translate=true, RootGroup="RootGroup", LayoutScalingMode=2, Scaling={Mode=2}, MarginSize=2/1024, MaxMutations=1, PaddingSize=4/1024})`,
            `ZomIslandGroups({Mode="DistributeInTilesEvenly", WorkingSet="Visible&UnLocked", FreezeIslands=true, UseTileLocks=true, UseIslandLocks=true, GroupPaths={ "RootGroup" }})`,

            `-- RizomUV2022 Repack filling full UV space --`,
            `ZomPack({RootGroup="RootGroup", WorkingSet="Visible&UnLocked", ProcessTileSelection=false, RecursionDepth=1, LayoutScalingMode=3, Rotate={Mode=0}, Scaling={Mode=0}})`,
            
            
            /*`-- Rizom2018 auto-select seams using mosaic algorithm --`,
            `ZomSelect({PrimType="Edge", Select=true, ResetBefore=true, WorkingSetPrimType="Island", ProtectMapName="Protect", FilterIslandVisible=true, Auto={QuasiDevelopable={Developability=${settings.cutSegmentationStrength}, IslandPolyNBMin=2, FitCones=false, Straighten=true}, HandleCutter=true, StretchLimiter=true, FlatteningMode=0, SQS=0.0357143, SQP=0.5, AQS=0.000178571, AQP=0.5}})`,
            `ZomSelect({PrimType="Edge", Select=true, ResetBefore=true, WorkingSetPrimType="Island", ProtectMapName="Protect", FilterIslandVisible=true, Auto={QuasiDevelopable={Developability=${options.cutSegmentationStrength}, IslandPolyNBMin=1, FitCones=false, Straighten=true}, HandleCutter=${options.cutHandles}}})`,
            `ZomCut({PrimType="Edge"})`,

            `-- unwrap --`,
            `ZomUnfold({PrimType="Edge", MinAngle=1e-05, Mix=1, Iterations=5, PreIterations=5, StopIfOutOFDomain=false, RoomSpace=0, PinMapName="Pin", ProcessNonFlats=true, ProcessSelection=true, ProcessAllIfNoneSelected=true, ProcessJustCut=true, BorderIntersections=true, TriangleFlips=true})`,

            `-- pack --`,
            `ZomIslandGroups({Mode="DistributeInTilesByBBox", MergingPolicy=8322})`,
            `ZomIslandGroups({Mode="DistributeInTilesEvenly", MergingPolicy=8322, UseTileLocks=true, UseIslandLocks=true})`,
            `ZomPack({ProcessTileSelection=false, RootGroup="RootGroup", RecursionDepth=1, MaxMutations=1, Resolution=500, MarginSize=2/1024, SpacingSize=4/1024, Scaling={Mode=2}, Rotate={Min=0, Max=180, Step=30}, Translate=true, LayoutScalingMode=2})`,
            */
            `-- save mesh --`,
            saveOperations.join("\n"),
            `ZomQuit()`
        ].join("\n");

        const fileName = "_rizomuv_" + uniqueId() + ".lua";
        const command = `"${this.configuration.executable}" -cfi "${instance.getFilePath(fileName)}"`;

        return instance.writeFile(fileName, content).then(() => ({
            command,
            script: { fileName, content }
        }));
    }
}