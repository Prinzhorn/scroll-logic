var EasyScroller = function(content, options) {

	this.content = content;
	this.container = content.parentNode;
	this.options = options || {};

	// create Scroller instance
	var that = this;
	this.scroller = new Scroller(options);

	//Yeah, that's just there as a quick hack.
	window.setInterval(function() {
		//console.log(that.scroller.__scrollOffset);
		that.render(that.scroller.__scrollOffset);
	}, 1000/60);

	// bind events
	this.bindEvents();

	// the content element needs a correct transform origin for zooming
	this.content.style[EasyScroller.vendorPrefix + 'TransformOrigin'] = "left top";

	// reflow for the first time
	this.reflow();

};

EasyScroller.prototype.render = (function() {

	var docStyle = document.documentElement.style;

	var engine;
	if (window.opera && Object.prototype.toString.call(opera) === '[object Opera]') {
		engine = 'presto';
	} else if ('MozAppearance' in docStyle) {
		engine = 'gecko';
	} else if ('WebkitAppearance' in docStyle) {
		engine = 'webkit';
	} else if (typeof navigator.cpuClass === 'string') {
		engine = 'trident';
	}

	var vendorPrefix = EasyScroller.vendorPrefix = {
		trident: 'ms',
		gecko: 'Moz',
		webkit: 'Webkit',
		presto: 'O'
	}[engine];

	var helperElem = document.createElement("div");
	var undef;

	var perspectiveProperty = vendorPrefix + "Perspective";
	var transformProperty = vendorPrefix + "Transform";

	if (helperElem.style[perspectiveProperty] !== undef) {

		return function(offset) {
			this.content.style[transformProperty] = 'translate3d(0, ' + (-offset) + 'px, 0)';
		};

	} else if (helperElem.style[transformProperty] !== undef) {

		return function(offset) {
			this.content.style[transformProperty] = 'translate(0, ' + (-offset) + 'px)';
		};

	} else {

		return function(offset) {
			this.content.style.marginTop = (-offset) + 'px';
		};

	}
})();

EasyScroller.prototype.reflow = function() {

	// set the right scroller dimensions
	this.scroller.setDimensions(this.container.clientHeight, this.content.offsetHeight);

};

EasyScroller.prototype.bindEvents = function() {

	var that = this;

	// reflow handling
	window.addEventListener("resize", function() {
		that.reflow();
	}, false);

	// touch devices bind touch events
	if ('ontouchstart' in window) {

		this.container.addEventListener("touchstart", function(e) {

			// Don't react if initial down happens on a form element
			if (e.touches[0] && e.touches[0].target && e.touches[0].target.tagName.match(/input|textarea|select/i)) {
				return;
			}

			that.scroller.doTouchStart(e.touches[0].pageY, e.timeStamp);
			e.preventDefault();

		}, false);

		document.addEventListener("touchmove", function(e) {
			that.scroller.doTouchMove(e.touches[0].pageY, e.timeStamp);
		}, false);

		document.addEventListener("touchend", function(e) {
			that.scroller.doTouchEnd(e.timeStamp);
		}, false);

		document.addEventListener("touchcancel", function(e) {
			that.scroller.doTouchEnd(e.timeStamp);
		}, false);

	// non-touch bind mouse events
	} else {

		var mousedown = false;

		this.container.addEventListener("mousedown", function(e) {

			if (e.target.tagName.match(/input|textarea|select/i)) {
				return;
			}

			that.scroller.doTouchStart(e.pageY, e.timeStamp);

			mousedown = true;
			e.preventDefault();

		}, false);

		document.addEventListener("mousemove", function(e) {

			if (!mousedown) {
				return;
			}

			that.scroller.doTouchMove(e.pageY, e.timeStamp);

			mousedown = true;

		}, false);

		document.addEventListener("mouseup", function(e) {

			if (!mousedown) {
				return;
			}

			that.scroller.doTouchEnd(e.timeStamp);

			mousedown = false;

		}, false);
	}

};

// automatically attach an EasyScroller to elements found with the right data attributes
document.addEventListener("DOMContentLoaded", function() {

	var elements = document.querySelectorAll('[data-scrollable]'), element;
	for (var i = 0; i < elements.length; i++) {

		element = elements[i];

		new EasyScroller(element, {
			bouncing: true,
			animating: true
		});

	};

}, false);