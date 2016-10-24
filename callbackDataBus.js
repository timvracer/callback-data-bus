"use strict";

/*
 * CallbackDataBus.js
 *
 * The problem this module solves is when multiple callers may be interested in the same asynchronous call.
 * An example may be processing a file list to read contents of files, and having duplicates in that list.  
 * dataBus will allow you to easily manage this so only 1 file retrival occurs, and the results (err, data)
 * delivered to all interested parties.  The key is the core identifier that determines duplicity.  data may
 * be cached (with an expiration date) for future calls (cached in memory) 
 *
 * The idea is that for the same key, if an action is already pending, simply wait 
 * for the initial action to complete, and return the results to all
 * who have registered interest in that key's results.  This avoids  wasted compute when multiple async
 * processes request the same action defined by key
 *
 * API: registerFetch(key, callback) 
 *      Registers the callback for the given key, returns TRUE if already registered, returns FALSE
 *      if not.  If already registered, you should just return and wait to be called back, you do not need
 *      to process again.
 *
 *      callbackPendingFor(key) - will return TRUE if there is an action pending for the given key
 *
 *      completeFetch(key, err, data, timeout) - will call all registered callbacks for the given key with the results
 *      data provided, and deletes the key record.  Note, callbacks occur on nextTick, after the function 
 *      deletes the interest record.  New actions registered on that key will start a new action UNLESS a timeout is specified
 *      <timeout> will hold the data on the databus for the period of time specified in milliseconds.  For as long as data
 * 		for a key is maintained based on timeout, subsequent registrations for that key will simply get the data returned
 *		immediately via the callback
 *
 * 		unless a timeout is specified, no data is stored/cached
 */

var LOGR = require("./lib/logr.js");

function init(info, warn, error, debug) {
	LOGR.init(info, warn, error, debug);
}

// The global callback queue, only holds pending registrations
var CALLBACK_QUEUE = {};
/*
 * CALLBACK_QUEUE:
 * {
 * 		callbacks: [],
 *		expiration: <integer milliseconds>,      // lifetime of cached data
 *      fetchInterval: <integer milliseconds>,   // refetch interval (autofetch)
 * 		fetchFunction: <function(callback)>,     // fetch function for refetch if used
 *		fetchTimer: <integer>,					 // active timer for a scheduled fetch
 *		results: {
 *					err: <as provided>,
 *					data: <as provided>
 *				 }
 * }
 */

/*
 * registerFetch
 *
 * indicate that you are going to retrieve data for key.  returns TRUE if there is already data
 * pending for this key which indicates you do not need to retreive the data.  The callback will
 * be invoked as soon as the data is available (which could be immediatly if the data is cached)
 *
 * If you specify forceUpdate, it will not use cached data, however if there is another call 
 * pending for this key, it will use the results of that fetch (and this function returns true)
 * So do not assume that specifying force gives the caller permission to fetch/complete, it still
 * needs to abide by the return value to determine whether to call complete
 */

function registerFetch(key, callback, forceUpdate) {

	var cachedData = cachedDataFor(key);

	LOGR.debug("forceUpdate is: " + forceUpdate);
	// is there data for this key, then return true (key exists) and send the data back
	if (!forceUpdate && cachedData) {
		LOGR.debug("Returning CACHED DATA for: " + key);
		process.nextTick(function() {callback(cachedData.err, cachedData.data);});
		return true;
	}
	// check if someone else is already registered to provide data for this key.  if so, simply add this requester
	// to the callback list to be notified when completed
	if (sizeOfCallbackQueue(key) > 0) {
		LOGR.debug("PUSHING key onto queue: " + key + " - " + sizeOfCallbackQueue(key));
		CALLBACK_QUEUE[key].callbacks.push(callback);
		return true;
	}
	// otherwise, this caller will be the data provider for this key, instantiate a new record
	LOGR.debug("QUEUING interest in : " + key);
	CALLBACK_QUEUE[key] = {};
	CALLBACK_QUEUE[key].callbacks = [callback];
	return false;
}
/*
 * completeFetch
 *
 * called when a "data retriever" (registrant who recieved "false" from registerInterest) has received their data
 * returns the raw err/data combo they obtained or generated.  This will send the data to all interested registrants
 * on the queue.
 *
 * if timeout is specified, data will remain available for the given key until the timeout expires
 * if timeout is <= 0, then the data will remain forever unless force updated
 */
function completeFetch(key, err, data, timeout) {  // timeout says how long the data stays around

	LOGR.debug("CALLING CALLBACKS FOR: " + key);
	LOGR.debug("COMPLETE FETCH " + data + " - " + timeout);
	LOGR.debug(CALLBACK_QUEUE[key]);
	// is anybody interested?  if not, we throw an exception
	if (sizeOfCallbackQueue(key) > 0) {
		// call every interested party with the data on the nextTick
		CALLBACK_QUEUE[key].callbacks.forEach (function(savedCallback, index) {
			process.nextTick( function() {savedCallback(err, data);});
		});

		// clear the callbacks
		CALLBACK_QUEUE[key].callbacks = []; 

		// if there is an auto-fetch interval, set a timer to re-fetch and re-schedule
		if (CALLBACK_QUEUE[key].fetchInterval) {
			CALLBACK_QUEUE[key].fetchTimer = setTimeout(function() {
				scheduleFetch(key, CALLBACK_QUEUE[key].fetchInterval, CALLBACK_QUEUE[key].fetchFunction);				
			}, CALLBACK_QUEUE[key].fetchInterval);
		}

		// if a timeout was specified, keep the results around for the specified period of time
		if (timeout) {
			CALLBACK_QUEUE[key].results = {err: err, data: data};
			// timeout <= 0 indicates keep data forever
			if (timeout > 0) {
				setTimeout(function() {
					expireCachedData(key);
				}, timeout);
				CALLBACK_QUEUE[key].expiration = new Date().getTime() + timeout;
			} else {
				CALLBACK_QUEUE[key].expiration = null;
			}
		} else {
			delete CALLBACK_QUEUE[key];
		}	
	} else {
		// this will cause an exception, if there is no callback regsitered, it means that the caller
		// erroneously processed things as to call the completeAction function on the given key twice
		// this cannot happen if the API is used correctly.
		throw "Error in completeAction(callbackQueue) - completeAction called, but there are no registered callbacks: " + key;
	}	
}

function expireCachedData(key) {
	if(CALLBACK_QUEUE[key] && CALLBACK_QUEUE[key].results) {
		delete CALLBACK_QUEUE[key].results;
	}
}

/*
 * sizeOfCallbackQueue
 *
 * returns number of callbacks on the queue for the given key
 */ 
function sizeOfCallbackQueue(key) {
	if (key in CALLBACK_QUEUE && CALLBACK_QUEUE[key].callbacks) {
		return CALLBACK_QUEUE[key].callbacks.length;
	} else {
		return 0;
	}
}

/*
 * cachedDataFor
 *
 * returns any cached data for the given key if it exists and is not stale, otherwise returns null
 */ 
function cachedDataFor(key) {
	if (key in CALLBACK_QUEUE) {
		if (CALLBACK_QUEUE[key].results) {
			// if data exists, and is not stale, return it
			if (CALLBACK_QUEUE[key].expiration===null || CALLBACK_QUEUE[key].expiration > new Date().getTime()) {
				return CALLBACK_QUEUE[key].results;
			}
			// data exists but is stale, delete it, clear expiration, and if there are no otehr pending callbacks (should not be)
			// then delete the record
			delete CALLBACK_QUEUE[key].results;
			delete CALLBACK_QUEUE[key].expiration;
			//if (sizeOfCallbackQueue(key) <= 0) {
			//	delete CALLBACK_QUEUE[key];
			//}
		}	
	} 
	return null;
}
/*
 * dataPendingFor
 *
 * returns whether the given key has or is expecting data from a primary registrant
 */ 
function dataPendingFor(key) {
	return (null !== cachedDataFor(key) || sizeOfCallbackQueue(key) > 0);
}

/*
 * scheduleFetch
 *
 * This will provide an "auto-fetch" capability, and is pretty independent of the overall scheme, but is provided as a helper capability
 * This is really nothing more than a setInterval on top of your existing fetch, but it will update the cache, and keep the data available
 * in cache.  Very simply, this is just updating the cache for you given your function.  The real work is creating a executable fetch
 * function that will succeed when called at intervals.
 *
 * example fetch function:
 * function(callback) {

		// do your fetch, async if needed
		request.get(url, function(err, response, body) {
			// call the provided callback
			callback(err, body);  // call the callback provided to you with the results
		}	
	}
 *
 * returns true if fetch is successfully scheduled, otherwise returns false
 */
function scheduleFetch(key, interval, fetchFunction) {

	// if there is data pending, fail and return false
	if (sizeOfCallbackQueue(key) > 0) {
		return false;
	}

	// register the initial fetch (force = true)
	if (registerFetch(key, nullFn, true)) {
		throw "Schedule Fetch: register returned true indicating a pending fetch";
	}
	// add the fetch interval to the key record
	CALLBACK_QUEUE[key].fetchInterval = interval;
	CALLBACK_QUEUE[key].fetchFunction = fetchFunction;

	// fetch the data, and call completeFetch which will invoke the callback above to registerFetch
	CALLBACK_QUEUE[key].fetchFunction(function(err, data) {
		completeFetch(key, err, data, -1); // set a data cache time equivalent to the interval*2
	});
	return true;
}

/*
 * cancelScheduleFetch
 *
 */

function cancelScheduleFetch(key) {

	if(sizeOfCallbackQueue(key) > 0) {
		return false;
	}

	var obj = CALLBACK_QUEUE[key];

	if(obj && obj.fetchTimer) {
		clearTimeout(CALLBACK_QUEUE[key].fetchTimer);
		delete CALLBACK_QUEUE[key];
	}
}

/*
 * reFetch
 *
 * helper function for readability, 
 */

function nullFn(err, data) {
	return null;
}


module.exports.registerFetch = registerFetch;
module.exports.dataPendingFor = dataPendingFor;
module.exports.sizeOfCallbackQueue = sizeOfCallbackQueue;
module.exports.cachedDataFor = cachedDataFor;
module.exports.completeFetch = completeFetch;
module.exports.scheduleFetch = scheduleFetch;
module.exports.cancelScheduleFetch = cancelScheduleFetch;
module.exports.init = init;

