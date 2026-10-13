import { createHandler, lazyDb } from '../src/handler.js';

export default createHandler(lazyDb());
