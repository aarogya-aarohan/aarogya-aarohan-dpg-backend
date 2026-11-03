import { JwtPayload } from 'jsonwebtoken';
import { Permission } from './permission';

interface Principle {
  id: string; // Corresponds to jwt.getSubject()
  jwt: unknown; // JWT object; replace 'any' with a specific type if available
  scopes: string[]; // List of scopes extracted from JWT
  oidcClientId: string; // Corresponds to jwt.getClaimAsString("azp")
  accountDisabled: boolean; // Account disabled status
  email: string; // User email
  emailVerified: boolean; // Email verified status
  accountLocked: boolean; // Account locked status
  givenName: string; // User's given name
  familyName: string; // User's family name
  username: string; // Username
  usernameNamespace: string; // Namespace for the username (azp)
  serviceAccount: boolean; // Whether the account is a service account
  fhirUserUrl: string; // FHIR user URL}
  authorities: GrantedAuthority[];
}

export class Session {
  constructor(
    readonly attempted: boolean,
    readonly authenticated: boolean,
    readonly principle?: Principle
  ) {}

  static authenticated(token: string, payload: JwtPayload) {
    const scopes = [...new Set(payload['scope'].split(' '))] as string[];
    const permissions = ((payload['realm_access']?.['roles'] as string[]) ??
      []) as Permission[];

    const args = {} as Record<string, string[]>;

    ((payload['permission_argument'] ?? []) as string[])
      .map((e) => e.split('/', 2))
      .filter((v) => v.length === 2)
      .forEach(([k, v]) => {
        if (!args[k]) args[k] = [];
        args[k].push(...v.split(','));
      });

    const principle = {
      id: payload.sub as string,
      jwt: token,
      scopes,
      oidcClientId: payload['azp'] as string,
      accountDisabled: false,
      email: payload['email'] as string,
      emailVerified: !!payload['emailVerified'],
      accountLocked: false,
      givenName: payload['given_name'],
      familyName: payload['family_name'],
      username: payload['preferred_username'],
      usernameNamespace: payload['azp'],
      serviceAccount: false,
      fhirUserUrl: ['Practitioner', payload['sub']].join('/'),
      authorities: permissions.map((p) => new GrantedAuthority(p, args)),
    } satisfies Principle;

    return new Session(true, true, principle);
  }

  static failed() {
    return new Session(true, false);
  }

  static notAttempted() {
    return new Session(true, false);
  }
}

export class GrantedAuthority {
  constructor(
    readonly permission: Permission,
    private readonly args: Record<string, string[]>
  ) {}

  get argument() {
    return this.args[this.permission] ?? [];
  }

  get isNegative() {
    return this.permission.toUpperCase().includes('BLOCK');
  }
}
