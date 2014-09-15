/*
 * Scroller
 * http://github.com/zynga/scroller
 *
 * Copyright 2011, Zynga Inc.
 * Licensed under the MIT License.
 * https://raw.github.com/zynga/scroller/master/MIT-LICENSE.txt
 *
 * Based on the work of: Unify Project (unify-project.org)
 * http://unify-project.org
 * Copyright 2011, Deutsche Telekom AG
 * License: MIT + Apache (V2)
 */

var Scroller;

(function() {
	var NOOP = function(){};

	/**
	 * A pure logic 'component' for 'virtual' scrolling.
	 */
	Scroller = function(options) {
		this.options = {

			/** Enable animations for deceleration, snap back and scrolling */
			animating: true,

			/** duration for animations triggered by scrollTo */
			animationDuration: 250,

			/** Enable bouncing (content can be slowly moved outside and jumps back after releasing) */
			bouncing: true,

			/** Callback that is fired on the later of touch end or deceleration end,
				provided that another scrolling action has not begun. Used to know
				when to fade out a scrollbar. */
			scrollingComplete: NOOP,

			/** This configures the amount of change applied to deceleration when reaching boundaries  **/
			penetrationDeceleration : 0.03,

			/** This configures the amount of change applied to acceleration when reaching boundaries  **/
			penetrationAcceleration : 0.08

		};

		for (var key in options) {
			this.options[key] = options[key];
		}
	};


	// Easing Equations (c) 2003 Robert Penner, all rights reserved.
	// Open source under the BSD License.

	/**
	 * @param pos {Number} position between 0 (start of effect) and 1 (end of effect)
	**/
	var easeOutCubic = function(pos) {
		return (Math.pow((pos - 1), 3) + 1);
	};

	/**
	 * @param pos {Number} position between 0 (start of effect) and 1 (end of effect)
	**/
	var easeInOutCubic = function(pos) {
		if ((pos /= 0.5) < 1) {
			return 0.5 * Math.pow(pos, 3);
		}

		return 0.5 * (Math.pow((pos - 2), 3) + 2);
	};


	var members = {

		/*
		---------------------------------------------------------------------------
			INTERNAL FIELDS :: STATUS
		---------------------------------------------------------------------------
		*/

		/** {Boolean} Whether a touch event sequence is in progress */
		__isTracking: false,

		/** {Boolean} Whether a deceleration animation went to completion. */
		__didDecelerationComplete: false,


		/**
		 * {Boolean} Whether the user has moved by such a distance that we have enabled
		 * dragging mode. Hint: It's only enabled after some pixels of movement to
		 * not interrupt with clicks etc.
		 */
		__isDragging: false,

		/**
		 * {Boolean} Not touching and dragging anymore, and smoothly animating the
		 * touch sequence using deceleration.
		 */
		__isDecelerating: false,

		/**
		 * {Boolean} Smoothly animating the currently configured change
		 */
		__isAnimating: false,



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

		/* {Number} Scheduled position (final position when animating) */
		__scheduledOffset: 0,



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
			INTERNAL FIELDS :: DECELERATION SUPPORT
		---------------------------------------------------------------------------
		*/

		/** {Integer} Minimum scroll position during deceleration */
		__minDecelerationScrollOffset: null,

		/** {Integer} Maximum scroll position during deceleration */
		__maxDecelerationScrollOffset: null,

		/** {Number} Current factor to modify scroll position with on every step */
		__decelerationVelocity: null,


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
		setDimensions: function(containerLength, contentLength) {

			var self = this;

			// Only update values which are defined
			if (containerLength === +containerLength) {
				self.__containerLength = containerLength;
			}

			if (contentLength === +contentLength) {
				self.__contentLength = contentLength;
			}

			// Refresh maximums
			self.__computeScrollMax();

			// Refresh scroll position
			self.scrollTo(self.__scrollOffset, true);

		},


		/**
		 * Returns the scroll position
		 */
		getValues: function() {

			return this.__scrollOffset;

		},


		/**
		 * Returns the maximum scroll values
		 *
		 * @return {Map} `left` and `top` maximum scroll values
		 */
		getScrollMax: function() {

			return this.__maxScrollOffset;

		},


		/**
		 * Scrolls to the given position. Respect limitations and snapping automatically.
		 *
		 * @param offset {Number} New scroll position.
		 * @param animate {Boolean?false} Whether the scrolling should happen using an animation
		 */
		scrollTo: function(offset, animate) {

			var self = this;

			// Stop deceleration
			if (self.__isDecelerating) {
				core.effect.Animate.stop(self.__isDecelerating);
				self.__isDecelerating = false;
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


		/*
		---------------------------------------------------------------------------
			EVENT CALLBACKS
		---------------------------------------------------------------------------
		*/


		/**
		 * Touch start handler for scrolling support
		 */
		doTouchStart: function(offset, timeStamp) {
			var self = this;

			// Reset interruptedAnimation flag
			self.__interruptedAnimation = true;

			// Stop deceleration
			if (self.__isDecelerating) {
				core.effect.Animate.stop(self.__isDecelerating);
				self.__isDecelerating = false;
				self.__interruptedAnimation = true;
			}

			// Stop animation
			if (self.__isAnimating) {
				core.effect.Animate.stop(self.__isAnimating);
				self.__isAnimating = false;
				self.__interruptedAnimation = true;
			}

			// Store initial positions
			self.__initialTouchOffset = offset;

			// Store initial touch positions
			self.__lastTouchOffset = offset;

			// Store initial move time stamp
			self.__lastTouchMove = timeStamp;

			// Reset tracking flag
			self.__isTracking = true;

			// Reset deceleration complete flag
			self.__didDecelerationComplete = false;

			// Dragging starts directly with two fingers, otherwise lazy with an offset
			self.__isDragging = false;

			// Clearing data structure
			self.__positions = [];

		},


		/**
		 * Touch move handler for scrolling support
		 */
		doTouchMove: function(offset, timeStamp) {

			var self = this;

			// Ignore event when tracking is not enabled (event might be outside of element)
			if (!self.__isTracking) {
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

						// Only use half of the distance to make the resistance at the edge tangible
						newOffset = currentOffset - (distance / 2);

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

				// Track scroll movement for decleration
				positions.push(newOffset, timeStamp);

				// Sync scroll position
				self.__publish(newOffset);

			// Otherwise figure out whether we are switching into dragging mode now.
			} else {
				var minimumTrackingForDrag = 5;

				var completeDistance = Math.abs(offset - self.__initialTouchOffset);

				positions.push(currentOffset, timeStamp);

				self.__isDragging = (completeDistance >= minimumTrackingForDrag);

				if (self.__isDragging) {
					self.__interruptedAnimation = false;
				}

			}

			// Update last touch positions and time stamp for next event
			self.__lastTouchOffset = offset;
			self.__lastTouchMove = timeStamp;

		},


		/**
		 * Touch end handler for scrolling support
		 */
		doTouchEnd: function(timeStamp) {

			var self = this;

			// Ignore event when tracking is not enabled (no touchstart event on element)
			// This is required as this listener ('touchmove') sits on the document and not on the element itself.
			if (!self.__isTracking) {
				return;
			}

			// Not touching anymore (when two finger hit the screen there are two touch end events)
			self.__isTracking = false;

			// Be sure to reset the dragging flag now. Here we also detect whether
			// the finger has moved fast enough to switch into a deceleration animation.
			if (self.__isDragging) {

				// Reset dragging flag
				self.__isDragging = false;

				// Start deceleration
				// Verify that the last move detected was in some relevant time frame
				//TODO: remove magic number 100
				if (self.options.animating && (timeStamp - self.__lastTouchMove) <= 100) {

					// Then figure out what the scroll position was about 100ms ago
					var positions = self.__positions;
					var endPos = positions.length - 1;
					var startPos = endPos;

					// Move pointer to position measured 100ms ago
					for (var i = endPos; i > 0 && positions[i] > (self.__lastTouchMove - 100); i -= 2) {
						startPos = i;
					}

					// If start and stop position is identical in a 100ms timeframe,
					// we cannot compute any useful deceleration.
					if (startPos !== endPos) {

						// Compute relative movement between these two points
						var timeOffset = positions[endPos] - positions[startPos];
						var movedOffset = self.__scrollOffset - positions[startPos - 1];

						// Based on 50ms compute the movement to apply for each render step
						self.__decelerationVelocity = movedOffset / timeOffset * (1000 / 60);

						// How much velocity is required to start the deceleration
						var minVelocityToStartDeceleration = 1;

						// Verify that we have enough velocity to start deceleration
						if (Math.abs(self.__decelerationVelocity) > minVelocityToStartDeceleration) {
							self.__startDeceleration(timeStamp);
						}
					} else {
						self.options.scrollingComplete();
					}
				} else if ((timeStamp - self.__lastTouchMove) > 100) {
					self.options.scrollingComplete();
				}
			}

			// If this was a slower move it is per default non decelerated, but this
			// still means that we want snap back to the bounds which is done here.
			// This is placed outside the condition above to improve edge case stability
			// e.g. touchend fired without enabled dragging. This should normally do not
			// have modified the scroll positions or even showed the scrollbars though.
			if (!self.__isDecelerating) {

				if (self.__interruptedAnimation || self.__isDragging) {
					self.options.scrollingComplete();
				}

				self.scrollTo(self.__scrollOffset, true);
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
			var wasAnimating = self.__isAnimating;
			if (wasAnimating) {
				core.effect.Animate.stop(wasAnimating);
				self.__isAnimating = false;
			}

			if (animate && self.options.animating) {

				// Keep scheduled positions for scrollBy functionality
				self.__scheduledOffset = newOffset;

				var oldOffset = self.__scrollOffset;

				var deltaOffset = newOffset - oldOffset;

				var step = function(percent, now, render) {

					self.__scrollOffset = oldOffset + (deltaOffset * percent);

				};

				var verify = function(id) {
					return self.__isAnimating === id;
				};

				var completed = function(renderedFramesPerSecond, animationId, wasFinished) {
					if (animationId === self.__isAnimating) {
						self.__isAnimating = false;
					}

					if (self.__didDecelerationComplete || wasFinished) {
						self.options.scrollingComplete();
					}
				};

				// When continuing based on previous animation we choose an ease-out animation instead of ease-in-out
				self.__isAnimating = core.effect.Animate.start(step, verify, completed, self.options.animationDuration, wasAnimating ? easeOutCubic : easeInOutCubic);

			} else {

				self.__scheduledLeft = self.__scrollOffset = newOffset;

			}
		},


		/**
		 * Recomputes scroll minimum values based on client dimensions and content dimensions.
		 */
		__computeScrollMax: function() {

			this.__maxScrollOffset = Math.max(this.__contentLength - this.__containerLength, 0);

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
		__startDeceleration: function(timeStamp) {

			var self = this;

			self.__minDecelerationScrollOffset = 0;
			self.__maxDecelerationScrollOffset = self.__maxScrollOffset;

			// Wrap class method
			var step = function(percent, now, render) {
				self.__stepThroughDeceleration(render);
			};

			// How much velocity is required to keep the deceleration running
			var minVelocityToKeepDecelerating = 0.1;

			// Detect whether it's still worth to continue animating steps
			// If we are already slow enough to not being user perceivable anymore, we stop the whole process here.
			var verify = function() {
				var shouldContinue = (Math.abs(self.__decelerationVelocity) >= minVelocityToKeepDecelerating);
				if (!shouldContinue) {
					self.__didDecelerationComplete = true;
				}
				return shouldContinue;
			};

			var completed = function(renderedFramesPerSecond, animationId, wasFinished) {
				self.__isDecelerating = false;
				if (self.__didDecelerationComplete) {
					self.options.scrollingComplete();
				}

				// Animate to grid when snapping is active, otherwise just fix out-of-boundary positions
				self.scrollTo(self.__scrollOffset);
			};

			// Start animation and switch on flag
			self.__isDecelerating = core.effect.Animate.start(step, verify, completed);

		},


		/**
		 * Called on every step of the animation
		 *
		 * @param inMemory {Boolean?false} Whether to not render the current step, but keep it in memory only. Used internally only!
		 */
		__stepThroughDeceleration: function(render) {

			var self = this;


			//
			// COMPUTE NEXT SCROLL POSITION
			//

			// Add deceleration to scroll position
			var scrollOffset = self.__scrollOffset + self.__decelerationVelocity;


			//
			// HARD LIMIT SCROLL POSITION FOR NON BOUNCING MODE
			//

			if (!self.options.bouncing) {

				var scrollOffsetFixed = Math.max(Math.min(self.__maxDecelerationScrollOffset, scrollOffset), self.__minDecelerationScrollOffset);
				if (scrollOffsetFixed !== scrollOffset) {
					scrollof = scrollOffsetFixed;
					self.__decelerationVelocity = 0;
				}

			}


			//
			// UPDATE SCROLL POSITION
			//

			if (render) {

				self.__publish(scrollOffset);

			} else {

				self.__scrollOffset = scrollOffset;

			}


			//
			// SLOW DOWN
			//

			// This is the factor applied to every iteration of the animation
			// to slow down the process. This should emulate natural behavior where
			// objects slow down when the initiator of the movement is removed
			var frictionFactor = 0.95;

			self.__decelerationVelocity *= frictionFactor;

			//
			// BOUNCING SUPPORT
			//

			if (self.options.bouncing) {

				var scrollOutside = 0;

				// This configures the amount of change applied to deceleration/acceleration when reaching boundaries
				var penetrationDeceleration = self.options.penetrationDeceleration;
				var penetrationAcceleration = self.options.penetrationAcceleration;

				// Check limits
				if (scrollOffset < self.__minDecelerationScrollOffset) {
					scrollOutside = self.__minDecelerationScrollOffset - scrollOffset;
				} else if (scrollOffset > self.__maxDecelerationScrollOffset) {
					scrollOutside = self.__maxDecelerationScrollOffset - scrollOffset;
				}

				// Slow down until slow enough, then flip back to snap position
				if (scrollOutside !== 0) {
					if (scrollOutside * self.__decelerationVelocity <= 0) {
						self.__decelerationVelocity += scrollOutside * penetrationDeceleration;
					} else {
						self.__decelerationVelocity = scrollOutside * penetrationAcceleration;
					}
				}
			}
		}
	};

	// Copy over members to prototype
	for (var key in members) {
		Scroller.prototype[key] = members[key];
	}

})();
