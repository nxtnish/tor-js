export type NodeDeps = {
    fs: typeof import('node:fs/promises');
    fsSync: typeof import('node:fs');
    os: typeof import('node:os');
    path: typeof import('node:path');
};
export declare function getNodeDeps(): Promise<NodeDeps>;
//# sourceMappingURL=node-deps.d.ts.map