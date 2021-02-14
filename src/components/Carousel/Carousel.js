import React, {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import styles from './Carousel.module.css';
import useKeys from '../../utils/useKeys';
import useTimer from '../../utils/useTimer';
import useSlides from '../../utils/useSlides';
import Slides from '../Slides';
import PropTypes from 'prop-types';
import {
  compareToProp,
  fallbackProps,
  numberBetween,
  positiveNumber
} from '../../utils/validators';
import {
  ArrowButtons,
  IndexBoard,
  DotButtons,
  MediaButtons,
  SizeButtons
} from '../Widgets';
import Thumbnails from '../Thumbnails';
import useMediaQuery from '../../utils/useMediaQuery';
import useKeyboard from '../../utils/useKeyboard';
import useSwipe from '../../utils/useSwipe';
import useFixedPosition from '../../utils/useFixedPosition';
import useEventListener from '../../utils/useEventListener';

export const Carousel = (props) => {
  const documentRef = useRef(document);
  const maximizedBackgroundRef = useRef(null);
  const carouselWrapperRef = useRef(null);
  const carouselRef = useRef(null);
  const slidesRef = useRef(null);
  const slideMinRef = useRef(null);
  const slideMaxRef = useRef(null);

  /* process slides */
  const hasImages = 'images' in props;
  const children = Array.isArray(props.children)
    ? props.children
    : [props.children];
  const rawSlides = hasImages ? props.images : children;
  const [slides, slidesElements] = useSlides(rawSlides, {
    index: props.index,
    rtl: props.isRTL,
    loop: props.isLoop
  });
  const nSlides = slides.length;
  const slidesMin = `-${nSlides}00%`;
  const slidesMax = `${nSlides}00%`;

  const [, setCurIndex] = useState(slides.curIndex);
  const { onIndexChange } = props;
  const onIndexChangeRef = useRef(onIndexChange);
  const applyCurIndexUpdate = useCallback(
    (curIndex) => {
      setCurIndex(curIndex);
      onIndexChangeRef.current(slides.curIndexForDisplay);
    },
    [setCurIndex, onIndexChangeRef, slides]
  );

  /* handle autoplay and reduced motion settings */
  const indexStep = props.isRTL ? -1 : +1;
  const [isPlaying, setIsPlaying] = useTimer(
    props.autoPlay && props.autoPlayInterval,
    props.autoPlayStarted,
    () => updateIndex(indexStep)
  );
  const handleMediaButtonClick = useCallback(() => {
    setIsPlaying((isPlaying) => !isPlaying);
  }, [setIsPlaying]);

  const isReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  useLayoutEffect(() => {
    if (isReducedMotion) setIsPlaying(false);
  }, [isReducedMotion, setIsPlaying]);

  const [wasPlaying, setWasPlaying] = useState(false);
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState !== 'visible') {
      // user switches tab away from the page
      setWasPlaying(isPlaying);
      setIsPlaying(false);
    } else {
      // user switches tab back to the page
      setIsPlaying(wasPlaying);
    }
  }, [isPlaying, setIsPlaying, wasPlaying, setWasPlaying]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handleVisibilityChange]);

  /* handle maximization and full screen */
  const [isMaximized, setIsMaximized] = useFixedPosition(
    false,
    carouselWrapperRef
  );
  const handleSizeButtonClick = () => {
    // carousel is to be maximized
    if (!isMaximized) carouselRef.current.focus();
    setIsMaximized((isMaximized) => !isMaximized);
  };

  /* handle UI update */
  const applyTransitionDuration = useCallback(
    (swipedDisplacement = 0, hasToUpdate = true) => {
      if (isReducedMotion) return;
      const swipedDistance = Math.abs(swipedDisplacement);
      const transitionDistance = hasToUpdate
        ? Math.abs(slidesRef.current.clientWidth - swipedDistance)
        : swipedDistance;
      let transitionDuration = transitionDistance / props.transitionSpeed;

      // bound transitionDuration match in an range
      if (
        props.transitionDurationMin &&
        transitionDuration < props.transitionDurationMin
      )
        transitionDuration = props.transitionDurationMin;
      // transitionMax has precedence over transitionMin
      if (
        props.transitionDurationMax &&
        transitionDuration > props.transitionDurationMax
      )
        transitionDuration = props.transitionDurationMax;
      // make transitionDuration match autoPlayInterval
      if (isPlaying && transitionDuration > props.autoPlayInterval)
        transitionDuration = props.autoPlayInterval * 1;

      slidesRef.current.style.transitionDuration = `${transitionDuration}ms`;
      setTimeout(
        () => (slidesRef.current.style.transitionDuration = null),
        transitionDuration
      );
    },
    [
      props.transitionSpeed,
      isPlaying,
      isReducedMotion,
      props.autoPlayInterval,
      props.transitionDurationMin,
      props.transitionDurationMax
    ]
  );

  const applyTransitionY = useCallback(
    (displacementX = 0, displacementY = 0) => {
      const hypotenuse = Math.hypot(displacementX, displacementY);
      if (carouselWrapperRef.current) {
        carouselWrapperRef.current.style.transform = `translate(${displacementX}px, ${displacementY}px) scale(${
          1 - hypotenuse / 10000
        })`;
      }
      if (maximizedBackgroundRef.current) {
        maximizedBackgroundRef.current.style.opacity = 1 - hypotenuse / 1000;
      }
    },
    [carouselWrapperRef, maximizedBackgroundRef]
  );

  const applyTransitionX = useCallback(
    (swipeDisplacement = 0) => {
      applyTransitionY(0, 0);
      if (slidesRef.current)
        slidesRef.current.style.transform = `translateX(calc(-100% * ${slides.curIndex} + ${swipeDisplacement}px))`;
    },
    [applyTransitionY, slides.curIndex]
  );

  // change to current index before browser paints
  useLayoutEffect(() => {
    applyTransitionX();
  }, [applyTransitionX]);

  /* handle neighbouring current index update */
  // store isMaximized to combat stale closure
  const shouldCalibrateIndex = props.isLoop && nSlides > 1;
  const calibrateIndexBySwipe = (displacementX) => {
    setIsPlaying(false);
    const change = -displacementX;
    if (shouldCalibrateIndex) {
      if (slides.isMin() && change < 0 && slideMaxRef.current) {
        slideMaxRef.current.style.transform = `translateX(${slidesMin})`;
      } else if (slides.isMax() && change > 0 && slideMinRef.current) {
        slideMinRef.current.style.transform = `translateX(${slidesMax})`;
      }
    }
    applyTransitionX(displacementX);
  };

  const updateIndex = useCallback(
    (change, swipedDisplacement = 0) => {
      if (shouldCalibrateIndex && slideMinRef.current && slideMaxRef.current) {
        if (slides.isMin() && change < 0) {
          slideMinRef.current.style.transform = `translateX(${slidesMax})`;
          slideMaxRef.current.style.transform = null;
        } else if (slides.isMax() && change > 0) {
          slideMinRef.current.style.transform = null;
          slideMaxRef.current.style.transform = `translateX(${slidesMin})`;
        } else if (change !== 0) {
          slideMinRef.current.style.transform = null;
          slideMaxRef.current.style.transform = null;
        }
      }
      if (change !== 0) {
        slides.calibrateIndex(change);
        applyTransitionX(swipedDisplacement);
      }
      slides.updateIndex(change);
      applyTransitionDuration(swipedDisplacement, change !== 0);
      applyTransitionX();
      applyCurIndexUpdate(slides.curIndex);
    },
    [
      shouldCalibrateIndex,
      slidesMin,
      slidesMax,
      slides,
      applyTransitionDuration,
      applyTransitionX,
      applyCurIndexUpdate
    ]
  );
  const rollBackUpdateIndex = () => updateIndex(0, 0);

  useEventListener(window, 'orientationchange', rollBackUpdateIndex);

  /* handle explicit current index update */
  const goToIndex = (index) => {
    setIsPlaying(false);
    slides.goToIndex(index);
    applyTransitionX();
    applyCurIndexUpdate(slides.curIndex);
  };
  const indices = slides.allIndices;
  const goToIndexCallbacks = indices.map((index) => () => goToIndex(index));
  const goToIndexCallbacksObj = indices.reduce(
    (obj, key, index) => ({ ...obj, [key]: goToIndexCallbacks[index] }),
    {}
  );

  /* handle keyboard events */
  useKeys(documentRef, { Escape: () => setIsMaximized(() => false) });
  useKeyboard(carouselWrapperRef);
  const goLeft = useCallback(() => updateIndex(-1), [updateIndex]);
  const goRight = useCallback(() => updateIndex(+1), [updateIndex]);
  useKeys(slidesRef, {
    ArrowLeft: goLeft,
    ArrowRight: goRight
  });

  /* handle mouse and touch events */
  const isMaximizedRef = useRef(isMaximized);
  isMaximizedRef.current = isMaximized;
  const handleSwipeMoveDown = (displacementX, displacementY) => {
    if (!props.shouldMinimizeOnSwipeDown) return;
    if (isMaximizedRef.current) applyTransitionY(displacementX, displacementY);
  };

  const handleSwipeEndDown = () => {
    if (!props.shouldMinimizeOnSwipeDown) return;
    setIsMaximized(() => false);
    rollBackUpdateIndex();
  };

  const handleClick = () => {
    if (isMaximizedRef.current && props.shouldMinimizeOnClick)
      setIsMaximized(() => false);
    else if (!isMaximizedRef.current && props.shouldMaximizeOnClick)
      setIsMaximized(() => true);
  };

  const mouseEventHandlers = useSwipe(carouselRef, props.swipeThreshold, {
    swipeMove: (displacementX) => calibrateIndexBySwipe(displacementX),
    swipeMoveDown: (displacementX, displacementY) =>
      handleSwipeMoveDown(displacementX, displacementY),
    swipeEndRight: (displacement) => updateIndex(-1, displacement),
    swipeEndLeft: (displacement) => updateIndex(+1, displacement),
    swipeEndDisqualified: (displacement) => updateIndex(0, displacement),
    swipeEndDown: handleSwipeEndDown,
    click: handleClick
  });

  /* process class names */
  const propsClassName = 'className' in props ? ' ' + props.className : '';
  const galleryClassName = hasImages ? ' ' + styles.gallery : '';
  const minCarouselWrapperCN =
    styles.carouselWrapper + propsClassName + galleryClassName;
  const maxCarouselWrapperCN = styles.maxCarouselWrapper + galleryClassName;
  const carouselWrapperClassName = isMaximized
    ? maxCarouselWrapperCN
    : minCarouselWrapperCN;

  /* process components for maximized carousel */
  const minCarouselPlaceholder = isMaximized && (
    <div className={minCarouselWrapperCN} style={props.style} />
  );
  const maxCarouselBackground = isMaximized && (
    <div ref={maximizedBackgroundRef} className={styles.maxCarouselWrapper} />
  );

  /* process widgets */
  const curIndexAsKey = slides.curIndexAsKey;
  const curIndexForDisplay = slides.curIndexForDisplay;

  const indexBoard = props.indexBoard && (
    <IndexBoard
      hasShadow={props.widgetsShadow}
      position={props.indexBoard}
      curIndex={curIndexForDisplay}
      totalIndices={indices.length}
    />
  );

  const mediaButtons = props.mediaButtons && props.autoPlay && (
    <MediaButtons
      hasShadow={props.widgetsShadow}
      position={props.mediaButtons}
      isPlaying={isPlaying}
      clickCallback={handleMediaButtonClick}
    />
  );

  const sizeButtons = props.sizeButtons && (
    <SizeButtons
      hasShadow={props.widgetsShadow}
      position={props.sizeButtons}
      isMaximized={isMaximized}
      clickCallback={handleSizeButtonClick}
    />
  );

  const arrowButtons = props.arrowButtons && (
    <ArrowButtons
      hasShadow={props.widgetsShadow}
      isRTL={props.isRTL}
      isLeftDisabled={!slides.canUpdateIndex(-1)}
      isRightDisabled={!slides.canUpdateIndex(+1)}
      onClickLeft={goLeft}
      onClickRight={goRight}
    />
  );

  const dotButtons = props.dotButtons && (
    <DotButtons
      hasShadow={props.widgetsShadow}
      position={props.dotButtons}
      curIndex={curIndexAsKey}
      callbacks={goToIndexCallbacksObj}
    />
  );

  const thumbnails = props.thumbnails && (
    <Thumbnails
      slides={slidesElements}
      hasImages={hasImages}
      lazyLoad={props.lazyLoad}
      curIndex={curIndexAsKey}
      callbacks={goToIndexCallbacksObj}
    />
  );

  return (
    <>
      {minCarouselPlaceholder}
      {maxCarouselBackground}
      <div
        ref={carouselWrapperRef}
        className={carouselWrapperClassName}
        style={isMaximized ? {} : props.style}
        data-is-keyboard-user='true'
      >
        <div
          ref={carouselRef}
          className={styles.carousel}
          {...(props.shouldSwipeOnMouse ? mouseEventHandlers : {})}
        >
          <Slides
            minRef={slideMinRef}
            maxRef={slideMaxRef}
            slidesRef={slidesRef}
            slides={slidesElements}
            hasImages={hasImages}
            length={nSlides}
            {...props}
          />
          {mediaButtons}
          {indexBoard}
          {sizeButtons}
          {arrowButtons}
          {dotButtons}
        </div>
        {thumbnails}
      </div>
    </>
  );
};

const widgetPositions = PropTypes.oneOf([
  false,
  'topLeft',
  'topCenter',
  'topRight',
  'bottomLeft',
  'bottomCenter',
  'bottomRight'
]).isRequired;

Carousel.propTypes = {
  images: PropTypes.array && fallbackProps(['children']),
  children: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.node),
    PropTypes.node
  ]),
  isRTL: PropTypes.bool.isRequired,
  isLoop: PropTypes.bool.isRequired,
  index: positiveNumber(true),
  lazyLoad: PropTypes.bool.isRequired,
  objectFit: PropTypes.oneOf([
    'contain',
    'cover',
    'fill',
    'none',
    'scale-down'
  ]),
  autoPlay: PropTypes.bool.isRequired,
  autoPlayStarted: PropTypes.bool.isRequired,
  autoPlayInterval: positiveNumber(false),
  swipeThreshold: numberBetween(0, 1),
  transitionSpeed: positiveNumber(true),
  transitionDurationMin: positiveNumber(true),
  transitionDurationMax: compareToProp('>=', 'transitionDurationMin'),
  widgetsShadow: PropTypes.bool.isRequired,
  mediaButtons: widgetPositions,
  indexBoard: widgetPositions,
  sizeButtons: widgetPositions,
  arrowButtons: PropTypes.bool.isRequired,
  dotButtons: PropTypes.oneOf([false, 'top', 'bottom']).isRequired,
  caption: PropTypes.oneOf([false, 'top', 'bottom']).isRequired,
  thumbnails: PropTypes.bool.isRequired,
  shouldSwipeOnMouse: PropTypes.bool.isRequired,
  shouldMaximizeOnClick: PropTypes.bool.isRequired,
  shouldMinimizeOnClick: PropTypes.bool.isRequired,
  shouldMinimizeOnSwipeDown: PropTypes.bool.isRequired,
  onIndexChange: PropTypes.func.isRequired,
  className: PropTypes.string,
  style: PropTypes.object
};

Carousel.defaultProps = {
  index: 0,
  isRTL: false,
  isLoop: true,
  lazyLoad: true,
  objectFit: 'cover',
  autoPlay: true,
  autoPlayStarted: false,
  autoPlayInterval: 5000, // ms
  swipeThreshold: 0.1, // * 100%
  transitionSpeed: 1, // px/ms
  widgetsShadow: false,
  mediaButtons: 'topLeft',
  indexBoard: 'topCenter',
  sizeButtons: 'topRight',
  arrowButtons: true,
  dotButtons: false,
  caption: false,
  thumbnails: true,
  shouldSwipeOnMouse: true,
  shouldMaximizeOnClick: false,
  shouldMinimizeOnClick: false,
  shouldMinimizeOnSwipeDown: true,
  onIndexChange: () => {}
};
