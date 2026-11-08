export async function onRequest(context, next) {
    const runtimeEnv = context.locals?.runtime?.env;
    if (runtimeEnv && typeof process !== 'undefined' && process.env) {
        for (const [key, value] of Object.entries(runtimeEnv)) {
            if (typeof value === 'string' && !process.env[key]) {
                process.env[key] = value;
            }
        }
    }
    return next();
}
