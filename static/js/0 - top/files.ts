type StreamOptions = {
    headers?: {
        [key: string]: string;
    }
};



function fileStream(url: string, files: FileList, options: StreamOptions = {}): Promise<void> {

    return new Promise(async (res, rej) => {
        if (typeof url !== 'string') 
            return res(
                console.error(
                    new Error('Url must be a string. Received ' + typeof url)));


        if (!files) return console.error(new Error('No files found'));
            
        if (!(files instanceof FileList)) 
            return res(
                console.error(
                    new Error('fileInput must be a FileList. Received ' + files)));

        

        const streamFile = async (index: number) => {
            const file = files[index];
            if (!file) return res(); // last file completed

            let filename = file.name.split('.').shift() || '';

            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.setRequestHeader('X-File-Name', filename);
            xhr.setRequestHeader('X-File-Size', file.size.toString());
            xhr.setRequestHeader('X-File-Type', file.type);
            xhr.setRequestHeader('X-File-Index', index.toString());
            xhr.setRequestHeader('X-File-Count', files.length.toString());
            xhr.setRequestHeader('X-File-Name', file.name);
            xhr.setRequestHeader('X-File-Ext', file.name.split('.').pop() || '');

            if (options?.headers) {
                for (const key in options.headers) {
                    xhr.setRequestHeader('X-Custom-' + key, options.headers[key]);
                }
            }

            // when done, do next file
            xhr.onload = (e) => streamFile(index + 1);
            xhr.onerror = rej;

            xhr.upload.onprogress = (e) => {
                // TODO: progress bar logic
            }

            // TODO: notification logic
            xhr.onreadystatechange = (e) => {
                if (xhr.readyState == 4) {
                    try {

                    } catch (e) {

                    }
                }
            }

            xhr.send(file);
        }

        streamFile(0);
    });
}