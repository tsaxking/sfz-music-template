// declare module 'express' {
//     export default function (req: Request, res: Response, next: NextFunction): void;

//     export interface Request {
//         session: import('../structure/sessions').Session;
//         ip: string;
//         url: string;
//         body: any;
//         headers: any;
//         cookies: any;
//         signedCookies: any;
//         query: any;
//         params: any;
//         method: string;
//         originalUrl: string;
//         path: string;
//         protocol: string;

//         io: import('socket.io').Server;
//         start: number;
//         file: {
//             id: string;
//             name: string;
//             size: number;
//             type: string;
//             ext: string;
//             contentType: string;
//             filename: string
//         }
//     }

//     interface Response {
//         send(data: any): Response;
//         sendFile(path: string): Response;
//     }
// }