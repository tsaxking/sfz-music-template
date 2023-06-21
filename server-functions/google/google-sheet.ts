import * as path from 'path';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import { config } from 'dotenv';

config();

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
];

const TOKEN_PATH = path.resolve(__dirname, '../../jsons/token.json');
const CREDENTIALS_PATH = path.resolve(__dirname, '../../jsons/credentials.json');

async function loadSavedCredentialsIfExist(): Promise<OAuth2Client|null> {
    try {
        const credentials = require(TOKEN_PATH);
        return credentials;
    } catch (err) {
        console.error(err);
        return null;
    }
}

async function saveCredentials(client: OAuth2Client): Promise<void> {
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    const keys = JSON.parse(content) as any;
    if (!keys) throw new Error('No keys found in credentials.json');
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFileSync(TOKEN_PATH, payload);
}

async function authorize(): Promise<OAuth2Client> {
    let client = await loadSavedCredentialsIfExist();
    if (client) return client;

    client = await authenticate({
        keyfilePath: CREDENTIALS_PATH,
        scopes: SCOPES
    });

    if (client.credentials) await saveCredentials(client);

    return client;
}

async function upload(data: string[][], sheet: string) {
    const auth = await authorize();
    const ssid = process.env.SHEET_ID;
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.clear({
        spreadsheetId: ssid,
        range: sheet
    });

    console.log('Uploading', data.length, 'rows to', sheet + '...');

    await sheets.spreadsheets.values.update({
        spreadsheetId: ssid,
        range: getSheetDataRange(sheet, data.length, Math.max(...data.map(d => d.length))),
        valueInputOption: 'RAW',
        requestBody: {
            values: data
        }
    });
}

function getSheetDataRange(sheet: string, rows: number, cols: number) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    // turn cols into A => Z, AA => ZZ, etc
    let col = '';
    while (cols > 0) {
        col = alphabet[(cols - 1) % alphabet.length] + col;
        cols = Math.floor((cols - 1) / alphabet.length);
    }

    return `${sheet}!A1:${col}${rows}`;
}