export type PublishResult = { id: string } & Record<string, any>

export interface Publisher {
    readonly id: string;

    publish(event: any): Promise<PublishResult>;

}