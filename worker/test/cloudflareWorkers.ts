// Unit tests run in Node: a stand-in for the Workers runtime module the OAuth provider imports.
export class WorkerEntrypoint<Env = unknown> {
  constructor(public ctx: ExecutionContext, public env: Env) {}
}
