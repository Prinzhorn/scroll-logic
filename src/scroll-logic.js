/*
 * scroll-logic
 * http://github.com/prinzhorn/scroll-logic
 *
 * Copyright 2011, Zynga Inc.
 * Modifications by Alexander Prinzhorn (@Prinzhorn)
 * Licensed under the MIT License.
 * https://github.com/Prinzhorn/scroll-logic/blob/master/LICENSE.txt
 *
 * Based on the work of: Unify Project (unify-project.org)
 * http://unify-project.org
 * Copyright 2011, Deutsche Telekom AG
 * License: MIT + Apache (V2)
 */

(function() {
	// How much velocity is required to start the deceleration.
	// This keeps the scroller from animating if the user is just slowly scrolling through.
	var MIN_VELOCITY_FOR_DECELERATION = 1;

	// The minimum distance before we start dragging.
	// This keeps small taps from moving the scroller.
	var MIN_DRAG_DISTANCE = 5;

	// The minimum velocity (in pixels per frame) after which we terminate the deceleration.
	var MIN_VELOCITY_BEFORE_TERMINATING = 0.1;

	// ScrollLogic doesn't care about fps, but this contant makes some of the math easier to understand.
	var FPS = 60;

	// The velocity changes by this amount every frame.
	var FRICTION_PER_FRAME = 0.95;

	// This means overscrolling is twice as hard than normal scrolling.
	var EDGE_RESISTANCE = 3;

	/**
	 * A pure logic 'component' for 'virtual' scrolling.
	 */
	var ScrollLogic = function(options) {
		this.options = {

			/** Enable animations for deceleration, snap back and scrolling */
			animating: true,

			/** duration for animations triggered by scrollTo */
			animationDuration: 250,

			/** Enable bouncing (content can be slowly moved outside and jumps back after releasing) */
			bouncing: true

		};

		for (var key in options) {
			this.options[key] = options[key];
		}
	};


	// Easing Equations (c) 2003 Robert Penner, all rights reserved.
	// Open source under the BSD License.
	// Optimized and refactored by @Prinzhorn. Also I don't think you can apply a license to such a tiny bit of math.

	var easeOutCubic = function(pos) {
		pos = pos - 1;

		return pos * pos * pos + 1;
	};

	var easeInOutCubic = function(pos) {
		if (pos < 0.5) {
			return 4 * pos * pos * pos;
		}

		//The >= 0.5 case is the same as easeOutCubic, but I'm not interested in a function call here.
		//It would simply be return easeOutCubic(p); if you want to.
		pos = pos - 1;

		return 4 * pos * pos * pos + 1;
	};

	var easeOutExpo = function(p) {
		//Make sure to map 1.0 to 1.0, because the formula below doesn't exactly yield 1.0 but 0.999023
		if(p === 1) {
			return 1;
		}

		return 1 - Math.pow(2, -10 * p);
	};

	var easeOutBack = function(pos) {
		var s = EDGE_RESISTANCE;

		pos = pos - 1;

		return (pos * pos * ((s + 1) * pos + s) + 1);
	};


	var members = {

		/*
		---------------------------------------------------------------------------
			INTERNAL FIELDS :: STATUS
		---------------------------------------------------------------------------
		*/

		// Whether a touch event sequence is in progress.
		__isInteracting: false,

		// Whether the user has moved by such a distance that we have enabled dragging mode.
		__isDragging: false,

		// Contains the animation configuration, if one is running.
		__animation: null,


		/*
		---------------------------------------------------------------------------
			INTERNAL FIELDS :: DIMENSIONS
		---------------------------------------------------------------------------
		*/

		/** {Integer} Available container length */
		__containerLength: 0,

		/** {Integer} Outer length of content */
		__contentLength: 0,

		/** {Number} Scroll position */
		__scrollOffset: 0,

		/** {Integer} Maximum allowed scroll position */
		__maxScrollOffset: 0,


		/*
		---------------------------------------------------------------------------
			INTERNAL FIELDS :: LAST POSITIONS
		---------------------------------------------------------------------------
		*/

		/** {Number} Position of finger at start */
		__lastTouchOffset: null,

		/** {Date} Timestamp of last move of finger. Used to limit tracking range for deceleration speed. */
		__lastTouchMove: null,

		/** {Array} List of positions, uses two indexes for each state: offset and timestamp */
		__positions: null,


		/*
		---------------------------------------------------------------------------
			PUBLIC API
		---------------------------------------------------------------------------
		*/

		/**
		 * Configures the dimensions of the client (outer) and content (inner) elements.
		 * Requires the available space for the outer element and the outer size of the inner element.
		 * All values which are falsy (null or zero etc.) are ignored and the old value is kept.
		 *
		 * @param containerLength {Integer ? null} Inner width of outer element
		 * @param contentLength {Integer ? null} Outer width of inner element
		 */
		setLengths: function(containerLength, contentLength) {

			var self = this;

			self.__containerLength = (containerLength + 0.5) | 0;
			self.__contentLength = (contentLength + 0.5) | 0;

			// Refresh maximums
			self.__maxScrollOffset = Math.max(contentLength - containerLength, 0);

			// Refresh scroll position
			self.scrollTo(self.__scrollOffset, true);

		},

		setContainerLength: function(containerLength) {

			var self = this;
			self.setLengths(containerLength, self.__contentLength);

		},

		setContentLength: function(contentLength) {

			var self = this;
			self.setLengths(self.__containerLength, contentLength);

		},


		/**
		 * Calculates and returns the current scroll position.
		 */
		getOffset: function() {
			var animation = this.__animation;
			var now;
			var percentage;
			var newOffset;

			if(animation) {
				//An animation is currently running, this is the trickier part.
				//Based on the current time, the start/end time of the animation and the easing function,
				//we can calculate the desired offset.
				now = Date.now();
				percentage = (now - animation.start) / animation.duration;

				//The animation is finished by now, clear the animation and use the animation's target offset.
				if(percentage >= 1) {
					this.__scrollOffset = animation.from + animation.distance;
					this.__animation = null;
				}
				//The animation is still running, calculate the current position.
				else {
					percentage = animation.easing(percentage);

					newOffset = animation.from + (animation.distance * percentage);

					//Without bouncing we need to prevent overscrolling and make a hard cut.
					if(!this.options.bouncing) {
						if(newOffset < 0) {
							this.__animation = null;
							newOffset = 0;
						} else if(newOffset > this.__maxScrollOffset) {
							this.__animation = null;
							newOffset = this.__maxScrollOffset;
						}
					}

					//We only want integer offsets, anything else does not make sense.
					this.__scrollOffset = (newOffset + 0.5) | 0;
				}
			}

			return this.__scrollOffset;
		},


		/**
		 * Returns the maximum scroll values
		 */
		getScrollMax: function() {
			return this.__maxScrollOffset;
		},


		/**
		 * Is scroll-logic currently doing anything?
		 */
		isResting: function() {
			return !this.__isInteracting && !this.__animation;
		},


		/**
		 * Scrolls to the given position. Respects bounds automatically.
		 */
		scrollTo: function(offset, animate) {

			var self = this;

			// Stop deceleration
			if (self.__animation) {
				self.__animation = null;
			}

			// Limit for allowed ranges
			offset = Math.max(Math.min(self.__maxScrollOffset, offset), 0);

			// Don't animate when no change detected, still call publish to make sure
			// that rendered position is really in-sync with internal data
			if (offset === self.__scrollOffset) {
				animate = false;
			}

			// Publish new values
			self.__publish(offset, animate);

		},


		/**
		 * Begin a new interaction with the scroller.
		 */
		beginInteraction: function(offset, timeStamp) {
			var self = this;

			// Stop animation
			if (self.__animation) {
				self.__animation = null;
			}

			// Store initial positions
			self.__initialTouchOffset = offset;

			// Store initial touch positions
			self.__lastTouchOffset = offset;

			// Store initial move time stamp
			self.__lastTouchMove = timeStamp;

			// Reset tracking flag
			self.__isInteracting = true;

			// Dragging starts lazy with an offset
			self.__isDragging = false;

			// Clearing data structure
			self.__positions = [];
		},


		/**
		 * A new user interaction with the scroller
		 */
		interact: function(offset, timeStamp) {

			var self = this;

			// Ignore event when tracking is not enabled (event might be outside of element)
			if (!self.__isInteracting) {
				return;
			}

			var positions = self.__positions;
			var currentOffset = self.__scrollOffset;

			// Are we already is dragging mode?
			if (self.__isDragging) {

				// Compute move distance
				var distance = offset - self.__lastTouchOffset;

				// Update the position
				var newOffset = currentOffset - distance;

				// Scrolling past one of the edges.
				if (newOffset < 0 || newOffset > self.__maxScrollOffset) {

					// Slow down on the edges
					if (self.options.bouncing) {

						// While overscrolling, apply the EDGE_RESISTANCE to make it move slower.
						newOffset = currentOffset - (distance / EDGE_RESISTANCE);

					}
					// Bouncing is disabled, prevent overscrolling.
					else {
						if (newOffset < 0) {

							newOffset = 0;

						} else {

							newOffset = self.__maxScrollOffset;

						}
					}
				}

				// Keep list from growing infinitely (holding min 10, max 20 measure points)
				if (positions.length > 60) {
					positions.splice(0, 30);
				}

				// Make sure this is an integer
				newOffset = (newOffset + 0.5) | 0;

				// Track scroll movement for deceleration
				positions.push(newOffset, timeStamp);

				// Sync scroll position
				self.__publish(newOffset);

			// Otherwise figure out whether we are switching into dragging mode now.
			} else {
				var completeDistance = Math.abs(offset - self.__initialTouchOffset);

				positions.push(currentOffset, timeStamp);

				self.__isDragging = (completeDistance >= MIN_DRAG_DISTANCE);
			}

			// Update last touch positions and time stamp for next event
			self.__lastTouchOffset = offset;
			self.__lastTouchMove = timeStamp;

		},


		/**
		 * Stop the user interaction
		 */
		endInteraction: function(timeStamp) {

			var self = this;

			if (!self.__isInteracting || !self.__isDragging) {
				return;
			}

			self.__isInteracting = false;
			self.__isDragging = false;

			var scrollOffset = self.__scrollOffset;

			// If the user dragged past the bounds, just snap back.
			if(scrollOffset < 0 || scrollOffset > self.__maxScrollOffset) {
				return self.scrollTo(scrollOffset, true);
			}

			if (self.options.animating) {

				var lastTouchMove = self.__lastTouchMove;

				// Start deceleration
				// Verify that the last move detected was in some relevant time frame
				//TODO: remove magic number 100
				if(timeStamp - lastTouchMove <= 100) {

					// Then figure out what the scroll position was about 100ms ago
					var positions = self.__positions;
					var positionsIndexEnd = positions.length - 1;
					var positionsIndexStart = positionsIndexEnd;
					var positionsIndex = positionsIndexEnd;

					// Move pointer to position measured 100ms ago
					// The positions array contains alternating offset/timeStamp pairs.
					for (; positionsIndex > 0; positionsIndex = positionsIndex - 2) {
						// Did we go back far enough and found the position 100ms ago?
						if(positions[positionsIndex] <= (lastTouchMove - 100)) {
							break;
						}

						positionsIndexStart = positionsIndex;
					}

					// If start and stop position is identical in a 100ms timeframe,
					// we cannot compute any useful deceleration.
					if (positionsIndexStart !== positionsIndexEnd) {

						// Compute relative movement between these two points
						var timeOffset = positions[positionsIndexEnd] - positions[positionsIndexStart];
						var movedOffset = scrollOffset - positions[positionsIndexStart - 1];

						// Based on 50ms compute the movement to apply for each render step
						var velocity = movedOffset / timeOffset * (1000 / 60);

						// Verify that we have enough velocity to start deceleration
						if (Math.abs(velocity) > MIN_VELOCITY_FOR_DECELERATION) {
							self.__startDeceleration(velocity);
						}
					}
				}
			}

			// Fully cleanup list
			self.__positions.length = 0;

		},



		/*
		---------------------------------------------------------------------------
			PRIVATE API
		---------------------------------------------------------------------------
		*/

		/**
		 * Applies the scroll position to the content element
		 *
		 * @param left {Number} Left scroll position
		 * @param top {Number} Top scroll position
		 * @param animate {Boolean?false} Whether animation should be used to move to the new coordinates
		 */
		__publish: function(newOffset, animate) {

			var self = this;

			// Remember whether we had an animation, then we try to continue based on the current "drive" of the animation
			var wasAnimating = !!self.__animation;

			if (wasAnimating) {
				self.__animation = null;
			}

			if (animate && self.options.animating) {

				var oldOffset = self.__scrollOffset;
				var distance = newOffset - oldOffset;

				self.__animation = {
					start: Date.now(),
					duration: self.options.animationDuration,
					// When continuing based on previous animation we choose an ease-out animation instead of ease-in-out
					easing: wasAnimating ? easeOutCubic : easeInOutCubic,
					from: oldOffset,
					distance: distance
				};

			} else {

				self.__scrollOffset = newOffset;

			}
		},


		/*
		---------------------------------------------------------------------------
			ANIMATION (DECELERATION) SUPPORT
		---------------------------------------------------------------------------
		*/

		/**
		 * Called when a touch sequence end and the speed of the finger was high enough
		 * to switch into deceleration mode.
		 */
		__startDeceleration: function(velocity) {

			var self = this;

			// Calculate the duration for the deceleration animation, which is a function of the start velocity.
			// This formula simply means we apply FRICTION_PER_FRAME to the velocity every frame, until it is lower than MIN_VELOCITY_BEFORE_TERMINATING.
			var durationInFrames = (Math.log(MIN_VELOCITY_BEFORE_TERMINATING) - Math.log(Math.abs(velocity))) / Math.log(FRICTION_PER_FRAME);
			var duration = (durationInFrames / FPS) * 1000;

			// Calculate the distance that the scroller will move during this duration.
			// http://en.wikipedia.org/wiki/Geometric_series#Formula where N is the number of frames,
			// because we terminate the series when the velocity drop below a minimum.
			// This formula simply means that we add up the decelarating velocity (or the distance) every frame until we reach MIN_VELOCITY_BEFORE_TERMINATING.
			var distance = velocity * ((1 - Math.pow(FRICTION_PER_FRAME, durationInFrames)) / (1 - FRICTION_PER_FRAME));

			var offset = self.__scrollOffset;
			var newOffset = offset + distance;
			var distanceFromBounds;

			var animation = self.__animation = {
				start: Date.now(),
				duration: duration,
				easing: easeOutExpo,
				from: self.__scrollOffset,
				distance: (distance + 0.5) | 0
			};

			var overscrolled = (newOffset < 0 || newOffset > self.__maxScrollOffset);

			if(self.options.bouncing && overscrolled) {
				if(newOffset < 0) {
					animation.distance = -offset;
				} else {
					animation.distance = self.__maxScrollOffset - offset;
				}

				animation.easing = easeOutBack;
				animation.duration = animation.duration / EDGE_RESISTANCE;
			}
		}
	};

	// Copy over members to prototype.
	for(var key in members) {
		ScrollLogic.prototype[key] = members[key];
	}

	if(typeof exports !== 'undefined') {
		if(typeof module !== 'undefined' && module.exports) {
			exports = module.exports = ScrollLogic;
		}
	} else {
		window.ScrollLogic = ScrollLogic;
	}
})();
