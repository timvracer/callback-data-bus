
/*jslint node: true */
"use strict";
/*jshint multistr: true */

var assert = require("assert");
var callbackDataBus = require("./../callbackDataBus.js");


//
// RUN TEST WITH THE FOLLOWING SHELL COMMAND
// NODE_ENV='test' mocha test/callback-data-bus_test.js --reporter spec
//

//callbackDataBus.init(console.log, console.log, console.log, console.log);

/*
 * callBackDataBus
 */
describe("callbackDataBus module", function() {

	var count=0;

	it("should start off with no registratons", function() {
		assert.equal(0, callbackDataBus.sizeOfCallbackQueue("key1"));
		assert.equal(0, callbackDataBus.sizeOfCallbackQueue("key2"));
	});
	it("should start off with no cached data", function() {
		assert.equal(null, callbackDataBus.cachedDataFor("key1"));
		assert.equal(null, callbackDataBus.cachedDataFor("key2"));
	});	
	it("should start off with no data pending", function() {
		assert.equal(false, callbackDataBus.dataPendingFor("key1"));
		assert.equal(false, callbackDataBus.dataPendingFor("key2"));
	});

	it("should register a new action", function() {
		assert.equal (false, callbackDataBus.registerFetch("key1", function(err, data) {
			assert.equal("data-goes-here", data);
			count++;
			assert.equal(1, count);
		}));
		assert.equal(true, callbackDataBus.dataPendingFor("key1"));
	});
	it ("should allow a second registration", function() {
		assert.equal (true, callbackDataBus.registerFetch("key1", function(err, data) {
			assert.equal("data-goes-here", data);
			count++;
			assert.equal(2, count);
		}));
		assert.equal(2, callbackDataBus.sizeOfCallbackQueue("key1"));
	});
	it("should properly call callbacks when action is executed, and then delete the record", function() {
		callbackDataBus.completeFetch("key1", null, "data-goes-here");
		// must do this on the nextTick to follow the actions in completeFetch which are put on the nextTick
		process.nextTick(function() { 
			assert.equal(false, callbackDataBus.dataPendingFor("key1"));
			assert.equal(2, count);
		});	
	});
	describe ("should store data on the databus for a specified period of time, then delete it", function() {
		var cnt = 0;
		var ret;

		it("should properly store data in cache and retrieve cached results", function() {

			ret = callbackDataBus.registerFetch("key3", function(err, data) {
				assert.equal("key3-data-goes-here", data);
				cnt++;
			});
			assert.equal(false, ret); // key should not have previously existed
			callbackDataBus.completeFetch("key3", null, "key3-data-goes-here", 1000); // hold data for 2 seconds

			assert.equal(true, callbackDataBus.dataPendingFor("key3"));
			// now register interest again in the same key, it should invoke callback automatically
			ret = callbackDataBus.registerFetch("key3", function(err, data) {
				assert.equal("key3-data-goes-here", data);
				cnt++;
			});
			assert.equal(true, ret); // since data is cached, should return true

			// must do this on the nextTick to follow the actions in completeFetch which are put on the nextTick
			process.nextTick(function() { 
				assert.equal(true, callbackDataBus.dataPendingFor("key3"));  // should still show the result at this point
				assert.equal(2, cnt); // we should have gotten 2 callbacks invoked
			});	
		});

		it ("should delete the stale record after the expiration date", function(done) {
			this.timeout(1600);
			// now check the status 2 seconds later when record should expire
			setTimeout(function() {
				assert.equal(false, callbackDataBus.dataPendingFor("key3")); // should have timed out
				done();
			}, 1500);
		});			
	});
	describe ("should ignore/replace cached data when force update is used", function() {
		var cnt = 0;
		var ret1;

		it("should properly store data in cache and retrieve cached results", function(done) {

			ret1 = callbackDataBus.registerFetch("key4", function(err, data) {
				assert.equal("key4-data-goes-here", data);
				cnt++;
			});
			assert.equal(false, ret1); // key should not have previously existed
			callbackDataBus.completeFetch("key4", null, "key4-data-goes-here", 1000); // hold data for 1 second

			assert.equal(true, callbackDataBus.dataPendingFor("key4"));
			// now register interest again in the same key, it should invoke callback automatically
			ret1 = callbackDataBus.registerFetch("key4", function(err, data) {
				assert.equal("key4-data-goes-here", data);
				cnt++;
			});
			assert.equal(true, ret1); // since data is cached, should return true

			// must do this on the nextTick to follow the actions in completeFetch which are put on the nextTick
			process.nextTick(function() { 
				assert.equal(true, callbackDataBus.dataPendingFor("key4"));  // should still show the result at this point
				assert.equal(2, cnt); // we should have gotten 2 callbacks invoked
				done();
			});
		});		

		if("should do the other thing", function() {
			var retval;
			retval = callbackDataBus.registerFetch("key4", function(err, data) {
				assert.equal("different-data-for-key4", data);
			}, true);

			it ("should return false to specify need to fetch if forceUpdate is specified", function() {
				assert.equal(false, retval); // 
			});

			it("should return new forced data when action is completed", function() {
				callbackDataBus.completeFetch("key4", null, "different-data-for-key4"); 
			});
		});			
	});

	describe("should autofetch data at specified interval", function(){

		this.timeout(6000);

		var count = 1;
		var lastCount = 1;
		var timer;

		var ret = callbackDataBus.scheduleFetch("key5", 1000, function(callback) {
			lastCount = count;
			callback(null, "AutoFetch number " + count++);
		});

		it ("should schedule the fetch successfully", function() {
			assert.equal(true, ret);
		});

		it ("should have put the data into the cache", function() {
			callbackDataBus.registerFetch("key5", function(err, data) {
				assert.equal("AutoFetch number " + lastCount, data);
			});
		});
		it ("should have put the data into the cache", function() {
			callbackDataBus.registerFetch("key5", function(err, data) {
				assert.equal("AutoFetch number " + lastCount, data);
			});
		});

		// loop at an interval to check cached data value
		it("should retrieve new data at intervals and make available in cache", function(doneit) {
			timer = setInterval(function() {

					var ret2 = callbackDataBus.registerFetch("key5", function(err, data) {
						assert.equal("AutoFetch number " + lastCount, data);
						if (count > 4) {
							clearInterval(timer);
							callbackDataBus.cancelScheduleFetch("key5");
							assert.equal(false, callbackDataBus.dataPendingFor("key5"));
							assert.equal(0, callbackDataBus.sizeOfCallbackQueue("key5"));
							doneit();
						}
					});

					assert.equal(true, ret2);
			}, 500);
		});	
	
	});
});
