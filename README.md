ScrollLogic
===========

This project is based on [zynga/scroller](https://github.com/zynga/scroller) which was not maintained any longer. This repo **does not have much in common** with the original though. It's a radically stripped down and optimized version which serves only one purpose.

It's a pure logic component for one-axis decelerated scrolling, imitating the way mobile devices do native scrolling. No render loop, no zooming, no snapping, no paging. It only serves a single purpose: providing the most accurate and high-performance backbone for your scrolling needs. It does not seem very useful on it's own, but I needed exactly that for _[enter project name as soon as it's public ;)]_. Since scroll-logic does not contain any rendering loop, it does not do _anything_ unless you request something from it (see `getOffset` below).


Usage
-----

```js
var scrollLogic = new ScrollLogic({
	//true by default.
	bouncing: false,

	//0 by default, but that doesn't make much sense.
	containerLength: 800,
	contentLength: 23000
});

scrollLogic.setBouncing(true);

//Set the length of the container and the scrollable content in pixels. ScrollLogic doesn't care if you do vertical or horizontal scrolling.
scrollLogic.setContainerLength(containerLength);
scrollLogic.setContentLength(contentLength);

//Get the scroll offset as integer. Can be negative or larger than (contentLength - containerLength) if bouncing is enabled.
//ScrollLogic doesn't do ANYTHING unless you query the offset. There's no animation loop or any computation going on.
var offset = scrollLogic.getOffset();

//Stop any deceleration that may be "running" and jump to the new position. The next `getOffset` call will return this position.
scrollLogic.setOffset(newOffset);

//Start a new interaction with the scrollable content. Usually this would be called on `touchstart`.
scrollLogic.beginInteraction(offset, timestamp);

//Once you've started a new interaction, you can add interactions. Usually this would be called on `touchmove`.
//This is a noop if there is no active interaction created using beginInteraction.
scrollLogic.interact(offset, timestamp);

//Ends the current interaction. Usually this would be called on `touchend` or `touchcancel`.
scrollLogic.endInteraction(offset, timestamp);

//Cancels the current interaction. This is different from `endInteraction` since it does not trigger decelerated motion, it just stops.
scrollLogic.cancelInteraction();
```