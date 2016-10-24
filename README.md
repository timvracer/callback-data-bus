CallbackDataBus
===============


#API

##init

You may optionally call the init function to specify your own loggers. By default, warn and error route to console.log, and 
info and error route to no action.  Your logger should accept a string as a paramater, the string to be logged.

*Usage:*
```
CallbackDataBus.init(info, warn, error, debug);

```


## Installation

  npm install callback-data-bus

## Tests

Tests are located in callback-data-bus_test.js.  You will need mocha installed, and set the node environment to "test".  
Run the tests from the shell with

```
NODE_ENV='test' mocha test/callback-data-bus_test.js --reporter spec
```

## License

The MIT License (MIT)

Copyright (c) 2016, Ask.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.



