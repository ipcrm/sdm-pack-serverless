import {
    Configuration,
} from "@atomist/automation-client";
import {
    onAnyPush,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
} from "@atomist/sdm";
import {
    configureSdm,
    createSoftwareDeliveryMachine,
} from "@atomist/sdm-core";
import {ServerlessDeploy} from "../lib/goal/deploy";

export function machineMaker(config: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine(
        {
            name: `${configuration.name}-test`,
            configuration: config,
        },
    );

    const dev = new ServerlessDeploy({
        uniqueName: "serverless-deploy-dev",
    }).with({
        deployArgs: { stage: "dev" },
    });

    sdm.withPushRules(
        onAnyPush()
            .setGoals(dev),
    );

    return sdm;
}

export const configuration: Configuration = {
    postProcessors: [
        configureSdm(machineMaker),
    ],
};
