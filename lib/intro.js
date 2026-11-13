import { createContext, useContext } from 'react'

// `entered` flips once the visitor gets through the entry gate; sections whose
// reveal should play on arrival (not hidden under the gate) key off it.
export const IntroContext = createContext({ entered: true })
export const useIntro = () => useContext(IntroContext)
