import {createCloudHandler} from './handler.mjs';
import {createOwnerAuth} from './auth.mjs';
import {loadAsset} from './assets.mjs';

// Reuse isolate-local throttle state. This is not a distributed rate limiter.
const handlers = new WeakMap();

export default {
  fetch(request, env) {
    let handler = handlers.get(env);
    if (!handler) {
      const auth = createOwnerAuth({env});
      handler = createCloudHandler({env, auth, assetLoader: loadAsset});
      handlers.set(env, handler);
    }
    return handler(request);
  }
};
