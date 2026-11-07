import {createCloudHandler} from './handler.mjs';
import {createOwnerAuth} from './auth.mjs';
import {createOwnerPasskeys} from './passkeys.mjs';
import {loadAsset} from './assets.mjs';
import {createTeachingConnector} from './teaching.mjs';
import {createMoneyConnector} from './money.mjs';
import {createPosConnector} from './pos.mjs';

// Reuse isolate-local throttle state. This is not a distributed rate limiter.
const handlers = new WeakMap();

export default {
  fetch(request, env) {
    let handler = handlers.get(env);
    if (!handler) {
      const auth = createOwnerAuth({env});
      const teaching = createTeachingConnector({env});
      const money = createMoneyConnector({env});
      const pos = createPosConnector({env});
      const passkeys = createOwnerPasskeys({env});
      handler = createCloudHandler({env, auth, teaching, money, pos, passkeys, assetLoader: loadAsset});
      handlers.set(env, handler);
    }
    return handler(request);
  },
  scheduled(_event, env, context) {
    const teaching = createTeachingConnector({env});
    context.waitUntil(teaching.scheduledSync());
  }
};
