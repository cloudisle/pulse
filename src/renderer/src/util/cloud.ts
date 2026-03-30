import {AwsOperationSettings, CloudOperationSettings} from "../../../shared/models";
import {useAwsStore} from "@renderer/stores/aws";

function resolveAwsSettings(): AwsOperationSettings|undefined {
    const aws = useAwsStore();

    if (!aws.selectedProfile) {
        return undefined;
    }

    return {
        profile: aws.selectedProfile,
    }
}

export function resolveCloudSettings(): CloudOperationSettings {
    return {
        aws: resolveAwsSettings(),
    }
}