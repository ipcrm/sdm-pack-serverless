import {ExtensionPack, metadata} from "@atomist/sdm";
import {ServerlessFulfillGoalOnRequested} from "./event/OnRequestedSdmGoal";

export const serverlessSupport = (): ExtensionPack => {
    return {
        ...metadata(),
        requiredConfigurationValues: [],
        configure: sdm => {
            sdm.addEvent(ServerlessFulfillGoalOnRequested);
            return sdm;
        },
    };
};
