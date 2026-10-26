import { quoteLine } from "./parseQuote";
import type { PageSpec, SceneContent } from "./types";

/**
 * Default content: the Gatsby quote, the manuscript text (F. Scott
 * Fitzgerald, The Great Gatsby, public domain) and the page arrangement.
 * Data only; swap this object (or build your own SceneContent) to change what
 * the scene types, prints and floats.
 */

export const PAGE_TEXTS: string[][] = [
  [
    "In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since.",
    "\"Whenever you feel like criticizing any one,\" he told me, \"just remember that all the people in this world haven't had the advantages that you've had.\"",
    "He didn't say any more, but we've always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that. In consequence, I'm inclined to reserve all judgments, a habit that has opened up many curious natures to me and also made me the victim of not a few veteran bores.",
    "The abnormal mind is quick to detect and attach itself to this quality when it appears in a normal person, and so it came about that in college I was unjustly accused of being a politician, because I was privy to the secret griefs of wild, unknown men.",
    "Most of the confidences were unsought - frequently I have feigned sleep, preoccupation, or a hostile levity when I realized by some unmistakable sign that an intimate revelation was quivering on the horizon.",
  ],
  [
    "And, after boasting this way of my tolerance, I come to the admission that it has a limit. Conduct may be founded on the hard rock or the wet marshes, but after a certain point I don't care what it's founded on.",
    "When I came back from the East last autumn I felt that I wanted the world to be in uniform and at a sort of moral attention forever; I wanted no more riotous excursions with privileged glimpses into the human heart.",
    "Only Gatsby, the man who gives his name to this book, was exempt from my reaction - Gatsby, who represented everything for which I have an unaffected scorn.",
    "If personality is an unbroken series of successful gestures, then there was something gorgeous about him, some heightened sensitivity to the promises of life, as if he were related to one of those intricate machines that register earthquakes ten thousand miles away.",
    "This responsiveness had nothing to do with that flabby impressionability which is dignified under the name of the \"creative temperament\" - it was an extraordinary gift for hope, a romantic readiness such as I have never found in any other person and which it is not likely I shall ever find again.",
  ],
  [
    "Gatsby believed in the green light, the orgastic future that year by year recedes before us. It eluded us then, but that's no matter - tomorrow we will run faster, stretch out our arms farther... And one fine morning -",
    "So we beat on, boats against the current, borne back ceaselessly into the past.",
    "Most of the big shore places were closed now and there were hardly any lights except the shadowy, moving glow of a ferryboat across the Sound. And as the moon rose higher the inessential houses began to melt away until gradually I became aware of the old island here that flowered once for Dutch sailors' eyes - a fresh, green breast of the new world.",
    "Its vanished trees, the trees that had made way for Gatsby's house, had once pandered in whispers to the last and greatest of all human dreams; for a transitory enchanted moment man must have held his breath in the presence of this continent, compelled into an aesthetic contemplation he neither understood nor desired, face to face for the last time in history with something commensurate to his capacity for wonder.",
  ],
  [
    "One of my most vivid memories is of coming back West from prep school and later from college at Christmas time. Those who went farther than Chicago would gather in the old dim Union Station at six o'clock of a December evening, with a few Chicago friends, already caught up into their own holiday gaieties, to bid them a hasty good-by.",
    "When we pulled out into the winter night and the real snow, our snow, began to stretch out beside us and twinkle against the windows, and the dim lights of small Wisconsin stations moved by, a sharp wild brace came suddenly into the air.",
    "That's my Middle West - not the wheat or the prairies or the lost Swede towns, but the thrilling returning trains of my youth, and the street lamps and sleigh bells in the frosty dark and the shadows of holly wreaths thrown by lighted windows on the snow.",
    "I see now that this has been a story of the West, after all - Tom and Gatsby, Daisy and Jordan and I, were all Westerners, and perhaps we possessed some deficiency in common which made us subtly unadaptable to Eastern life.",
  ],
];

/** Text already on the sheet in the typewriter (above the line being typed). */
export const SHEET_TEXT: string[] = [
  "Even when the East excited me most, even when I was most keenly aware of its superiority to the bored, sprawling, swollen towns beyond the Ohio, with their interminable inquisitions which spared only the children and the very old - even then it had always for me a quality of distortion.",
  "West Egg, especially, still figures in my more fantastic dreams. I see it as a night scene by El Greco: a hundred houses, at once conventional and grotesque, crouching under a sullen, overhanging sky and a lustreless moon.",
  "In the foreground four solemn men in dress suits are walking along the sidewalk with a stretcher on which lies a drunken woman in a white evening dress. Her hand, which dangles over the side, sparkles cold with jewels. Gravely the men turn in at a house - the wrong house. But no one knows the woman's name, and no one cares.",
];

/** Text typed live onto the sheet in the machine. It is also the first two lines of the floating quote. */
export const TYPED_LINE = "After Gatsby's death, New York was haunted for me...";

const PAGE_LAYOUT: Omit<PageSpec, "paragraphs">[] = [
  { x: -0.33, z: 0.11, yaw: 0.32, age: 0.65, crease: true },
  { x: -0.12, z: 0.27, yaw: -0.12, age: 0.45, coffeeRing: true },
  { x: 0.17, z: 0.24, yaw: 0.18, age: 0.55 },
  { x: 0.38, z: 0.05, yaw: -0.42, age: 0.7, crease: true },
];

export const GATSBY_CONTENT: SceneContent = {
  typedLine: TYPED_LINE,
  sheetParagraphs: SHEET_TEXT,
  pages: PAGE_LAYOUT.map((layout, i) => ({ ...layout, paragraphs: PAGE_TEXTS[i % PAGE_TEXTS.length] })),
  quote: [
    quoteLine("After Gatsby's **death,**", { size: 1.25, offset: [-2.2, 2.6, 0.6], arrival: 20.5, wordStagger: 0.42, source: "typed" }),
    quoteLine("New York was ^1.3^haunted^ for me...", { size: 1.25, offset: [0.4, 0.9, 0.0], arrival: 22.0, wordStagger: 0.34, source: "typed" }),
    quoteLine("distorted beyond my eyes'", { size: 0.92, offset: [1.6, -1.1, -1.4], arrival: 23.8, wordStagger: 0.3 }),
    quoteLine("power of correction.", { size: 0.92, offset: [3.4, -2.3, -2.2], arrival: 25.2, wordStagger: 0.3 }),
  ],
};
