
/* =========================================================
   RUDIMENTARY PATHOLOGY
   Shared Website JavaScript
   ========================================================= */


/* =========================================================
   COLLAPSIBLE SECTIONS
   ========================================================= */

function toggleCollapsible(header) {

    const section =
        header.parentElement;

    section.classList.toggle("open");

}


/* =========================================================
   SLIDESHOW
   ========================================================= */

function changeSlide(button, direction) {


    /* Find the slideshow containing the button */

    const slideshow =
        button.closest(
            ".slideshow-container"
        );


    /* Get the image data */

    const images =
        JSON.parse(
            slideshow.dataset.images
        );


    /* Get current image */

    let current =
        parseInt(
            slideshow.dataset.slide
        );


    /* Move forward/backward */

    current += direction;


    /* Wrap around */

    if (current >= images.length) {

        current = 0;

    }


    if (current < 0) {

        current =
            images.length - 1;

    }


    /* Store current slide */

    slideshow.dataset.slide =
        current;


    /* Update image */

    slideshow.querySelector(
        ".slide-image"
    ).src =
        images[current].src;


    /* Update caption */

    slideshow.querySelector(
        ".caption"
    ).textContent =
        images[current].caption;


    /* Update counter */

    slideshow.querySelector(
        ".counter"
    ).textContent =

        "Image " +
        (current + 1) +
        " of " +
        images.length;

}


/* =========================================================
   KEYBOARD CONTROLS
   ========================================================= */

document.addEventListener(
    "keydown",
    function(event) {


        /*
         * Find open pathology sections.
         */

        const openSlideshows =
            document.querySelectorAll(
                ".pathology.open .slideshow-container"
            );


        /*
         * If there is no open slideshow,
         * don't do anything.
         */

        if (
            openSlideshows.length === 0
        ) {

            return;

        }


        /*
         * Use the last open slideshow.
         */

        const slideshow =
            openSlideshows[
                openSlideshows.length - 1
            ];


        const nextButton =
            slideshow.querySelector(
                ".next"
            );


        const previousButton =
            slideshow.querySelector(
                ".previous"
            );


        /*
         * Right arrow key
         */

        if (
            event.key === "ArrowRight"
        ) {

            changeSlide(
                nextButton,
                1
            );

        }


        /*
         * Left arrow key
         */

        if (
            event.key === "ArrowLeft"
        ) {

            changeSlide(
                previousButton,
                -1
            );

        }

    }
);
