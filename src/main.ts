import { time } from 'console';
import { exit } from 'process';
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

interface LoopControl {
    auth_info: AuthTokenData,
    start_time: number,
    loop_time: number,
    accumulate: string[],
    shouldContinue: boolean,
    rate: number,
    offset: number,
    loop_fn: (loopControl: LoopControl) => Promise<void>
}


const credentials: ClientCredentials = {
    client_id: process.env.CLIENT_ID ?? '',
    client_secret: process.env.CLIENT_SECRET ?? ''
}

const rate: number = Number.parseInt(process.env.API_RATE) ?? 10


const auth_response = await fireAuthRequest(credentials)

if (!checkAuthResponse(auth_response)) {
    console.debug(auth_response)
    exit(-1);
}

console.debug(auth_response.data)


const start = Date.now()
const loop_control: LoopControl = {
    auth_info: auth_response.data,
    start_time: start,
    loop_time: start,
    accumulate: [],
    shouldContinue: true,
    rate: rate,
    offset: 0,
    loop_fn: async function(loop_control: LoopControl) {
        while(loop_control.shouldContinue) {
            for(const promise of Array(4).fill(undefined).map(() => {
                const promise = fireGameRequest(loop_control.rate, loop_control.offset)
                loop_control.offset += loop_control.rate
                return promise
            })) {
                const response = await promise
                if(checkGameResponse(response)) {
                    processData(loop_control.accumulate, response.data)
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
                const auth_response = await fireAuthRequest(credentials)
        
                if (!checkAuthResponse(auth_response)) {
                    console.debug(auth_response)
                    exit(-1);
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

await loop_control.loop_fn(loop_control)
console.debug(loop_control.accumulate.join())

function delay(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}


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




function checkSuccessCode(response: axios.Response<unknown>): boolean {
    return response.status === 200
}

function checkAuthResponse(auth_response: axios.Response<AuthTokenData>): boolean {
    return checkSuccessCode(auth_response)
}

function checkGameResponse(game_response: axios.Response<GameInfo[]>): boolean {
    return checkSuccessCode(game_response) && game_response.data.length !== 0
}

function logGameResponseData(val: GameInfo) {
    console.debug(`Name: ${val.name}`);
    if(Array.isArray(val.alternative_names)) {
            val.alternative_names?.forEach((val, i) => console.debug(`Alt ${i}: ${val.name}`))
    }
}


async function fireAuthRequest(credentials: ClientCredentials): Promise<axios.Response<AuthTokenData>> {
    return redaxios.post(
    'https://id.twitch.tv/oauth2/token',
    '',
    {
        method: 'post',
        params: new URLSearchParams({
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'grant_type': 'client_credentials'
        }),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }
)};

async function fireGameRequest(limit: number, offset: number): Promise<axios.Response<GameInfo[]>> {
    return redaxios.post(
        "https://api.igdb.com/v4/games",
        `fields name, alternative_names.name; where name = "M"*; limit ${limit}; offset ${offset};`,
        {
            headers: {
                'Accept': 'application/json',
                'Client-ID': 'e9j16khituyyxn5xfrk4tlzf5ixhl5',
                'Authorization': `Bearer ${auth_response.data.access_token}`,
            }
        },
    )
}

function processData(accumulate: string[], data: GameInfo[]) {
    accumulate.push(...data.flatMap<string>(val => flattenGameInfo(val)))
}

function flattenGameInfo(val: GameInfo): string[] {
    const accumulator: string[] = []
    if(val.name.length < 10) {
        accumulator.push(val.name)
    } 
    if(Array.isArray(val.alternative_names)) {
        accumulator.push(...val.alternative_names.map(val => val.name).filter(val => val.charAt(0) === "M" && val.length < 10))
    }
    return accumulator
}

