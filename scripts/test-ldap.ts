import dotenv from 'dotenv';
import path from 'path';
import { Client } from 'ldapts';

// Load Env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function testLdapConnection() {
    console.log('\n🔍 Testing LDAP Connection...');

    const url = process.env.LDAP_URL;
    const bindDN = process.env.LDAP_BIND_DN;
    const bindPassword = process.env.LDAP_BIND_PASSWORD;

    console.log(`URL: ${url}`);
    console.log(`Bind DN: ${bindDN}`);
    console.log(`Password: ${bindPassword ? '********' : '(Empty)'}`);

    if (!url || !bindDN || !bindPassword) {
        console.error('❌ Error: Missing LDAP configuration. Please check .env file.');
        process.exit(1);
    }

    const client = new Client({
        url,
        // timeout: 5000,
        // connectTimeout: 5000
    });

    try {
        console.log('Connecting...');
        await client.bind(bindDN, bindPassword);
        console.log('✅ Bind Successful! Credentials are valid.');

        console.log('Unbinding...');
        await client.unbind();
        console.log('✅ Connection closed cleanly.');
        process.exit(0);
    } catch (error) {
        console.error('❌ LDAP Connection Failed:', error.message || error);
        if (error.code === 'EQA_INVALID_CREDENTIALS' || error.name === 'InvalidCredentialsError') {
            console.error('👉 Hint: Check your username (Bind DN) or Password.');
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.error('👉 Hint: Check LDAP URL and firewall settings.');
        }
        process.exit(1);
    }
}

testLdapConnection();
