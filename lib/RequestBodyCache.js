const log = require('./log');

/**
 * If the request body data exceeds this size, caching will be aborted.
 * @define {number}
 */
const MAX_REQUEST_BODY_CACHE_SIZE = 2 * 1024; // 2 KiB

/**
 * Class for caching client request bodies, so requests with body data can be repeated after successful authentication.
 */
class RequestBodyCache {
    /**
     * Returns the maximum cache size.
     *
     * @returns {number} The maximum cache size for a single request.
     */
    static getMaxCacheSize() {
        return MAX_REQUEST_BODY_CACHE_SIZE;
    }

    /**
     * Initialize a new RequestBodyCache.
     *
     * @param {http.IncomingMessage}  req  The HTTP request to read the body data from.
     */
    constructor(req) {
        this.req = req;
        this.cache = [];
        this.cacheSize = 0;
        this.cacheOverflow = false;
        this.readStarted = false;
        this.readComplete = false;

        this.cacheChunk = this.cacheChunk.bind(this);
        this.streamCache = this.streamCache.bind(this);
        this.pipe = this.pipe.bind(this);
    }

    /**
     * Add a chunk to the cache.
     *
     * @param {*}  chunk  Data chunk.
     */
    cacheChunk(chunk) {
        if (this.cacheOverflow) {
            return;
        }

        this.cacheSize += chunk.length;

        if (this.cacheSize > MAX_REQUEST_BODY_CACHE_SIZE) {
            this.cacheOverflow = true;
            this.cache = [];
        } else {
            this.cache.push(chunk);
        }
    }

    /**
     * Stream the cache content.
     *
     * @param {stream.Writable}  writableStream  Writable stream to stream to.
     */
    streamCache(writableStream) {
        if (this.cacheOverflow) {
            throw new Error('Cache overflowed while reading source, cannot stream from cache.');
        }

        for (let i = 0; i < this.cache.length; i += 1) {
            writableStream.write(this.cache[i]);
        }
        writableStream.end();
    }

    /**
     * Stream the request body. On the first call, the body data is read from the request and cached while being passed
     * on. On subsequent calls, the body data is read from cache.
     *
     * @param {stream.Writable}  writableStream  Writable stream to stream to.
     */
    pipe(writableStream) {
        process.nextTick(() => {
            if (this.readComplete) {
                this.streamCache(writableStream);
                return;
            }

            if (this.readStarted) {
                throw new Error('Can only call pipe() once while caching source.');
            }

            this.readStarted = true;

            this.req.on('data', (chunk) => {
                this.cacheChunk(chunk);
                writableStream.write(chunk);
            });

            this.req.on('end', () => {
                if (this.cacheOverflow) {
                    log.d(`[${this.req.__requestId}] RequestBodyCache: Cache overflowed while caching data`);
                } else {
                    log.d(`[${this.req.__requestId}] RequestBodyCache: Cached ${this.cacheSize} bytes of data`);
                }

                this.readComplete = true;
                writableStream.end();
            });
        });
    }
}

module.exports = RequestBodyCache;
