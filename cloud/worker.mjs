import {createCloudHandler} from './handler.mjs';
import {createOwnerAuth} from './auth.mjs';
import {loadAsset} from './assets.mjs';
import {createTeachingConnector} from './teaching.mjs';

// Reuse isolate-local throttle state. This is not a distributed rate limiter.
const handlers = new WeakMap();

export default {
  fetch(request, env) {
    let handler = handlers.get(env);
    if (!handler) {
      const auth = createOwnerAuth({env});
      const teaching = createTeachingConnector({env});
      handler = createCloudHandler({env, auth, teaching, assetLoader: loadAsset});
      handlers.set(env, handler);
    }
    return handler(request);
  },
  scheduled(_event, env, context) {
    const teaching = createTeachingConnector({env});
    context.waitUntil(teaching.scheduledSync());
  }
};
