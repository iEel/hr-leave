export interface AzureUserEntry {
    id: string;
    userPrincipalName: string;
    displayName: string;
    givenName: string;
    surname: string;
    mail: string;
    onPremisesSamAccountName?: string;
    employeeId?: string;
    accountEnabled?: boolean;
}

/**
 * Get App-Only Access Token from Azure AD (Client Credentials Flow)
 */
async function getAccessToken(): Promise<string | null> {
    const tenantId = process.env.AZURE_AD_TENANT_ID;
    const clientId = process.env.AZURE_AD_CLIENT_ID;
    const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        console.error('[Azure] Missing Azure AD Configuration (Tenant, ClientID, Secret)');
        return null;
    }

    try {
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('scope', 'https://graph.microsoft.com/.default');
        params.append('client_secret', clientSecret);
        params.append('grant_type', 'client_credentials');

        const response = await fetch(tokenUrl, {
            method: 'POST',
            body: params,
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[Azure] Failed to get access token:', error);
            return null;
        }

        const data: { access_token: string } = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('[Azure] Token request error:', error);
        return null;
    }
}

/**
 * Fetch all users from Azure AD via Microsoft Graph API
 */
export async function fetchAzureUsers(): Promise<AzureUserEntry[]> {
    const token = await getAccessToken();
    if (!token) return [];

    let users: AzureUserEntry[] = [];
    let nextLink: string | null = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,givenName,surname,onPremisesSamAccountName,employeeId,accountEnabled&$top=999';

    try {
        while (nextLink) {
            const response = await fetch(nextLink, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                console.error('[Azure] Graph API Error:', await response.text());
                break;
            }

            const data: { value: AzureUserEntry[]; '@odata.nextLink'?: string } = await response.json();
            if (data.value && Array.isArray(data.value)) {
                users = [...users, ...data.value];
            }

            nextLink = data['@odata.nextLink'] || null;
        }

        return users;
    } catch (error) {
        console.error('[Azure] Fetch users error:', error);
        return [];
    }
}
