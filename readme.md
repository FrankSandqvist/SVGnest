An early attempt at porting Jack000's SVGNest into a Typescript NodeJS library.

Unfortunately, I'm not too familiar with the algorithms, so I'm attempting a straight port. (So I may have gotten some of the types wrong at this point)

I'm not really happy with this port at this point, a ton of cleanup needed. There's currently no consistency in the set-up leading up to the actual nesting (some stuff is done by mutating, and some stuff done immutable). 

Thinking of using Worker Threads?

Some stuff done so far;
- XML2JS to convert the SVG into plain object
- NPM to get clipper-lib, svg-pathdata, svgpath
- Trying to make it as functional as possible (small classes)
- newer JS/TS features
- I'd say that up until launchWorkers, some good progress has been made

Any help is appreciated!
