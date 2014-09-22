(function() {
	var containerElement = document.getElementById('container');
	var contentElement = document.getElementById('content');
	var scrollLogic = new ScrollLogic();

	scrollLogic.setLengths(containerElement.offsetHeight, contentElement.offsetHeight);

	document.addEventListener('touchstart', function(e) {
		e.preventDefault();
		scrollLogic.beginInteraction(e.touches[0].pageY, e.timeStamp);
	}, false);

	document.addEventListener('touchmove', function(e) {
		e.preventDefault();
		scrollLogic.interact(e.touches[0].pageY, e.timeStamp);
	}, false);

	document.addEventListener('touchend', function(e) {
		e.preventDefault();
		scrollLogic.endInteraction(e.timeStamp);
	}, false);

	document.addEventListener('touchcancel', function(e) {
		e.preventDefault();
		scrollLogic.endInteraction(e.timeStamp);
	}, false);

	window.addEventListener('resize', function() {
		scrollLogic.setLengths(containerElement.offsetHeight, contentElement.offsetHeight);
	});

	var render = function(offset) {
		contentElement.style.webkitTransform = 'translate3d(0px, ' + -offset + 'px, 0px)';
	};

	(function loop() {
		render(scrollLogic.getOffset());
		webkitRequestAnimationFrame(loop);
	}());
}());