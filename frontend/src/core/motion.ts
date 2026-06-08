/**
 * Reusable motion animation tokens for Framer Motion transitions.
 */
export const MOTION_TOKENS = {
  // Spring-based transition for layout expansions/collapses
  layoutSpring: {
    type: "spring" as const,
    stiffness: 300,
    damping: 28,
  },
  
  // Ease-based transition for simple fading or scaling
  fadeTransition: {
    duration: 0.2,
    ease: "easeInOut",
  },
  
  // Reusable variants for collapsible panels and lists
  collapseVariants: {
    open: {
      opacity: 1,
      height: "auto",
      overflow: "hidden" as const,
    },
    collapsed: {
      opacity: 0,
      height: 0,
      overflow: "hidden" as const,
    }
  }
};
