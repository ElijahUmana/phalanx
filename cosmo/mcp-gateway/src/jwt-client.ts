// Tiny client for the Phalanx jwt-mock issuer at localhost:4005.
// Each mint is a fresh HTTP call — we don't cache tokens because the gateway
// wants to mint per-call so a test can exercise UNAUTHORIZED / wrong-role
// flows cleanly.

export type PhalanxRole = 'ANALYST' | 'REMEDIATOR' | 'ROLLOUT_OPERATOR' | 'UNAUTHORIZED';

export interface MintedToken {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
    scopes: string[];
    role: PhalanxRole;
}

export interface JwtClientOptions {
    issuerUrl: string;
}

export class JwtClient {
    constructor(private readonly options: JwtClientOptions) {}

    async mint(role: PhalanxRole, agentId?: string): Promise<MintedToken> {
        const url = `${this.options.issuerUrl.replace(/\/$/, '')}/token`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, agentId }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '<unreadable>');
            throw new Error(
                `jwt-mock returned ${res.status} ${res.statusText}: ${body}`,
            );
        }
        const data = (await res.json()) as MintedToken;
        if (!data.accessToken) {
            throw new Error(`jwt-mock response missing accessToken: ${JSON.stringify(data)}`);
        }
        return data;
    }
}
