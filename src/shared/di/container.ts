export class Container {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private dependencies = new Map<string, any>();

    register<T>(name: string, dependency: T): void {
        this.dependencies.set(name, dependency);
    }

    resolve<T>(name: string): T {
        const dependency = this.dependencies.get(name);
        if (!dependency) {
            throw new Error(`Dependency ${name} not found in container`);
        }
        return dependency as T;
    }
}

export const container = new Container();
