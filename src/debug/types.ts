export type DebugConsoleApi = {
    trackRemote: (homeRoom: string, remoteRoom: string, on?: boolean) => string;
    dumpRemote: (homeRoom: string, remoteRoom: string) => string;
    dumpHome: (homeRoom: string) => string;
};
