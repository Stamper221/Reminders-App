"use client"

import { motion } from "framer-motion"

interface PageTransitionProps {
    children: React.ReactNode
    className?: string
}

const pageVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
}

export function PageTransition({ children, className }: PageTransitionProps) {
    return (
        <motion.div
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={className}
        >
            {children}
        </motion.div>
    )
}
