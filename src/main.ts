import { config, DotenvConfig } from 'dotenv';
import * as axios from 'redaxios';

const redaxios = axios.default

interface AuthTokenData {
    access_token: string,
    expires_in: number,
    token_type: string
}

interface ClientCredentials {
    client_id: string,
    client_secret: string
}

interface GameInfo {
    id : number
    name : string
    alternative_names ?: AltName[]
}

interface AltName {
    id : number
    name : string
}

interface ILoopControl {
    credentials: ClientCredentials,
    auth_info: AuthTokenData,
    start_time: number,
    loop_time: number,
    accumulate: string[],
    shouldContinue: boolean,
    rate: number,
    offset: number,
}

class LoopControl implements ILoopControl {
    credentials: ClientCredentials
    auth_info: AuthTokenData;
    start_time: number;
    loop_time: number;
    accumulate: string[];
    shouldContinue: boolean;
    rate: number;
    offset: number;
    
    constructor(credentials: ClientCredentials, auth_info: AuthTokenData, env: DotenvConfig) {
        this.credentials = credentials
        this.auth_info = auth_info
        const start = Date.now()
        this.start_time = start
        this.loop_time = start
        this.accumulate = []
        this.shouldContinue = true
        this.rate = Number.parseInt(env['API_RATE'] ?? 10)
        this.offset = 0
    }

    async loop_fn() {
        while(loop_control.shouldContinue) {
            for(const promise of Array(4).fill(undefined).map(() => {
                const promise = fire_game_request(loop_control.credentials, loop_control.rate, loop_control.offset)
                loop_control.offset += loop_control.rate
                return promise
            })) {
                const response = await promise
                if(check_game_response(response)) {
                    process_game_info_data(loop_control.accumulate, response.data)
                    console.debug(`Promise returned: ${response.status}`)
                    console.debug(response.data)
                } else {
                    loop_control.shouldContinue = false
                    console.debug(response)
                }
    
            }
            console.debug(`Accumulated: ${loop_control.accumulate.length}`)
            const after_loop_time = Date.now()
            const expiry_time = Math.floor((after_loop_time - loop_control.start_time) / 1000)
            if(expiry_time >= loop_control.auth_info.expires_in) {
                const auth_response = await fire_auth_request(credentials)
        
                if (!check_auth_response(auth_response)) {
                    console.debug(auth_response)
                    Deno.exit(-1);
                }
    
                loop_control.start_time = Date.now()
                loop_control.auth_info = auth_response.data
                console.debug(auth_response.data)
            }
        
            const millis = after_loop_time - loop_control.loop_time
    
            if (millis < 2500) {
                await delay(2500 - millis)
            }
            loop_control.loop_time = after_loop_time
    
            console.debug('Loop back.')
        }
    }
}


const env: DotenvConfig = await config({
    export: false,
    safe: false,
    defaults: undefined
})

console.log(env)

const credentials: ClientCredentials = {
    client_id: env['CLIENT_ID'] ?? '',
    client_secret: env['CLIENT_SECRET'] ?? ''
}

const auth_response = await fire_auth_request(credentials)

if (!check_auth_response(auth_response)) {
    console.debug(auth_response)
    Deno.exit(-1);
}

console.debug(auth_response.data)


const loop_control = new LoopControl(credentials, auth_response.data, env)

await loop_control.loop_fn()
console.debug(loop_control.accumulate.join())



/*
if(!checkGameResponse(game_response)) {
    console.debug(game_response)
    exit(-1)
}

if(Array.isArray(game_response.data)) {
    game_response.data.forEach(val => {
        logGameResponseData(val)
    })
} else {
    logGameResponseData(game_response.data)
}
*/



function delay(millis: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, millis));
}

function check_success_code(response: axios.Response<unknown>): boolean {
    return response.status === 200
}

function check_auth_response(auth_response: axios.Response<AuthTokenData>): boolean {
    return check_success_code(auth_response)
}

function check_game_response(game_response: axios.Response<GameInfo[]>): boolean {
    return check_success_code(game_response) && game_response.data.length !== 0
}

function _log_game_response_data(val: GameInfo) {
    console.debug(`Name: ${val.name}`);
    if(Array.isArray(val.alternative_names)) {
        val.alternative_names?.forEach((val, i) => console.debug(`Alt ${i}: ${val.name}`))
    }
}


function fire_auth_request(credentials: ClientCredentials): Promise<axios.Response<AuthTokenData>> {
    return redaxios.post(
    'https://id.twitch.tv/oauth2/token',
    '',
    {
        params: new URLSearchParams({
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'grant_type': 'client_credentials'
        }),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }
)}

function fire_game_request(credentials: ClientCredentials, limit: number, offset: number): Promise<axios.Response<GameInfo[]>> {
    return redaxios.post(
        "https://api.igdb.com/v4/games",
        `fields name, alternative_names.name; where name = "M"*; limit ${limit}; offset ${offset};`,
        {
            headers: {
                'Accept': 'application/json',
                'Client-ID': credentials.client_id,
                'Authorization': `Bearer ${auth_response.data.access_token}`,
            }
        },
    )
}

function process_game_info_data(accumulate: string[], data: GameInfo[]) {
    accumulate.push(...data.flatMap<string>(val => flatten_game_info(val)))
}

function flatten_game_info(val: GameInfo): string[] {
    const accumulator: string[] = []
    if([...val.name].length === 6) {
        accumulator.push(val.name)
    } 
    if(Array.isArray(val.alternative_names)) {
        accumulator.push(
            ...val.alternative_names
                .map(val => val.name)
                .filter(val => val.charAt(0) === "M" && [...val].length === 6)
        )
    }
    return accumulator
}

