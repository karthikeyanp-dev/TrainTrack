import type { Variants, Transition } from "framer-motion";

// Easing functions
export const easings = {
  outExpo: [0.16, 1, 0.3, 1] as const,
  inExpo: [0.7, 0, 0.84, 0] as const,
  elastic: [0.68, -0.55, 0.265, 1.55] as const,
  smooth: [0.4, 0, 0.2, 1] as const,
  bounce: [0.34, 1.56, 0.64, 1] as const,
};

// Spring configurations
export const springs = {
  gentle: { type: "spring", stiffness: 120, damping: 14 } as const,
  bouncy: { type: "spring", stiffness: 300, damping: 20 } as const,
  stiff: { type: "spring", stiffness: 400, damping: 30 } as const,
  slow: { type: "spring", stiffness: 100, damping: 20 } as const,
};

// Fade animations
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.4,
      ease: easings.outExpo,
    }
  },
  exit: { opacity: 0, y: -10 },
};

export const fadeInDown: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.4,
      ease: easings.outExpo,
    }
  },
  exit: { opacity: 0, y: 10 },
};

export const fadeInLeft: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: 0.4,
      ease: easings.outExpo,
    }
  },
  exit: { opacity: 0, x: -10 },
};

export const fadeInRight: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: 0.4,
      ease: easings.outExpo,
    }
  },
  exit: { opacity: 0, x: 10 },
};

// Scale animations
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: springs.gentle,
  },
  exit: { opacity: 0, scale: 0.95 },
};

export const scaleInBounce: Variants = {
  initial: { opacity: 0, scale: 0.5 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: springs.bouncy,
  },
  exit: { opacity: 0, scale: 0.9 },
};

// Slide animations
export const slideUp: Variants = {
  initial: { y: 40, opacity: 0 },
  animate: { 
    y: 0, 
    opacity: 1,
    transition: {
      duration: 0.5,
      ease: easings.outExpo,
    }
  },
  exit: { y: 20, opacity: 0 },
};

export const slideDown: Variants = {
  initial: { y: -40, opacity: 0 },
  animate: { 
    y: 0, 
    opacity: 1,
    transition: {
      duration: 0.5,
      ease: easings.outExpo,
    }
  },
  exit: { y: -20, opacity: 0 },
};

// Stagger containers
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1,
    },
  },
};

export const staggerContainerFast: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.02,
      staggerDirection: -1,
    },
  },
};

export const staggerContainerSlow: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
};

// Stagger items
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.4,
      ease: easings.outExpo,
    }
  },
  exit: { 
    opacity: 0, 
    y: -10,
    transition: {
      duration: 0.2,
    }
  },
};

export const staggerItemScale: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: springs.gentle,
  },
  exit: { 
    opacity: 0, 
    scale: 0.8,
    transition: {
      duration: 0.2,
    }
  },
};

// Card hover animation
export const cardHover = {
  rest: { 
    scale: 1, 
    y: 0,
    boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  },
  hover: { 
    scale: 1.02, 
    y: -4,
    boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
    transition: {
      duration: 0.3,
      ease: easings.outExpo,
    }
  },
  tap: { 
    scale: 0.98,
    transition: {
      duration: 0.1,
    }
  },
};

// Button animations
export const buttonTap = {
  scale: 0.97,
  transition: {
    duration: 0.1,
  }
};

export const buttonHover = {
  scale: 1.02,
  transition: {
    duration: 0.2,
    ease: easings.outExpo,
  }
};

// Page transitions
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.4,
      ease: easings.outExpo,
    }
  },
  exit: { 
    opacity: 0, 
    y: -10,
    transition: {
      duration: 0.2,
    }
  },
};

// Modal/Dialog animations
export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1,
    transition: {
      duration: 0.2,
    }
  },
  exit: { 
    opacity: 0,
    transition: {
      duration: 0.2,
      delay: 0.1,
    }
  },
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: {
      duration: 0.3,
      ease: easings.outExpo,
    }
  },
  exit: { 
    opacity: 0, 
    scale: 0.95, 
    y: 10,
    transition: {
      duration: 0.2,
    }
  },
};

// Dropdown/Popover animations
export const dropdownMenu: Variants = {
  initial: { opacity: 0, y: -8, scale: 0.95 },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: {
      duration: 0.2,
      ease: easings.outExpo,
    }
  },
  exit: { 
    opacity: 0, 
    y: -8, 
    scale: 0.95,
    transition: {
      duration: 0.15,
    }
  },
};

// Toast notifications
export const toastSlide: Variants = {
  initial: { opacity: 0, x: 100, scale: 0.9 },
  animate: { 
    opacity: 1, 
    x: 0, 
    scale: 1,
    transition: {
      duration: 0.4,
      ease: easings.elastic,
    }
  },
  exit: { 
    opacity: 0, 
    x: 100, 
    scale: 0.9,
    transition: {
      duration: 0.2,
    }
  },
};

// Loading spinner
export const spinTransition: Transition = {
  repeat: Infinity,
  ease: "linear",
  duration: 1,
};

// Pulse animation for status indicators
export const pulseAnimation = {
  scale: [1, 1.1, 1],
  opacity: [1, 0.8, 1],
  transition: {
    duration: 2,
    repeat: Infinity,
    ease: "easeInOut",
  }
};

// Shake animation for errors
export const shakeAnimation = {
  x: [0, -10, 10, -10, 10, 0],
  transition: {
    duration: 0.5,
    ease: easings.outExpo,
  }
};

// Counter animation helper
export const countUp = (duration: number = 1) => ({
  transition: {
    duration,
    ease: easings.outExpo,
  }
});

// Viewport animation settings for scroll-triggered animations
export const viewportOnce = {
  once: true,
  margin: "-50px",
};

export const viewportAlways = {
  margin: "-50px",
};
