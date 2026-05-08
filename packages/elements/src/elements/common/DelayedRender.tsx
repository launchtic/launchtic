import React, { useState, useEffect } from "react";

type DelayedRenderProps = {
  delay?: number;
  children: React.ReactNode;
};

export const DelayedRender: React.FC<DelayedRenderProps> = ({ delay = 0, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  return isVisible ? <>{children}</> : null;
};
