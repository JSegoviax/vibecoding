import { useState, useEffect } from 'react'

interface AnimatedResourceIconProps {
  image1: string
  image2: string
  alt: string
  size?: number
}

export function AnimatedResourceIcon({ image1, image2, alt, size = 16 }: AnimatedResourceIconProps) {
  const [currentImage, setCurrentImage] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage(prev => (prev === 0 ? 1 : 0))
    }, 1000) // Alternate every second

    return () => clearInterval(interval)
  }, [])

  return (
    <img
      src={currentImage === 0 ? image1 : image2}
      alt={alt}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        imageRendering: 'pixelated',
      }}
    />
  )
}
