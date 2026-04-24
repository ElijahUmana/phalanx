// Shared TinyFish SDK client. Instantiated once per process; TinyFish handles
// its own connection pooling and retries so a singleton is sufficient.

import { TinyFish } from '@tiny-fish/sdk';
import { env } from '../env.js';

let singleton: TinyFish | null = null;

export function getTinyFish(): TinyFish {
    if (singleton) return singleton;
    const apiKey = env().TINYFISH_API_KEY;
    singleton = new TinyFish({ apiKey });
    return singleton;
}
