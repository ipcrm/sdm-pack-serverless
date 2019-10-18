import {
    Configuration,
} from "@atomist/automation-client";
import {
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration, whenPushSatisfies,
} from "@atomist/sdm";
import {
    configureSdm,
    createSoftwareDeliveryMachine,
} from "@atomist/sdm-core";
import {ServerlessDeploy} from "../lib/goal/deploy";
import {serverlessSupport} from "../lib/serverless";
import {IsServerlessDeployable} from "../lib/support/pushTest";

export function machineMaker(config: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine(
        {
            name: `${configuration.name}-test`,
            configuration: config,
        },
    );

    const dev = new ServerlessDeploy()
        .with({
            deployArgs: { stage: "dev" },
        });

    sdm.addExtensionPacks(
        serverlessSupport(),
    );

    sdm.withPushRules(
        whenPushSatisfies(IsServerlessDeployable)
            .setGoals(dev),
    );

    return sdm;
}

export const configuration: Configuration = {
    postProcessors: [
        configureSdm(machineMaker),
    ],
};
