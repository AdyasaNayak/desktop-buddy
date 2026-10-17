# Desktop Buddy Website Design Workshop

This document is for defining the website before implementation begins.

The website should feel like a tiny enchanted room where visitors meet the pet before adopting it. It should not feel like a generic software download page.

## Product Direction

The current product is a desktop cat companion with:

- Idle animation
- Heart animation when interacted with
- Drink-water interaction
- Work mode
- Sleep mode
- Reminders

The website should introduce the companion, show its personality, explain what it does, and make downloading it feel like adopting a small desktop friend.

## Design Process

We will work through these stages:

1. Define the pet's personality
2. Define the fairycore vintage-game world
3. Define the visitor journey
4. Choose the website sections
5. Create the visual system
6. Sketch the page layout
7. Define interactions and animations
8. Prepare content and download requirements
9. Build one small approved slice
10. Review and iterate

## Step 1: Define the Pet

Answer the following questions.

### Identity

**Pet name:** we gonna let the users decide what to call their pet and what their pet should call them as well...we'll let them customize the name on website and change in our app accordingly to give a more personal feel to each user.

**Species:**

Is it specifically a cat, or should users eventually be able to choose different pets?

currently its a cat but eventually we are gonna add various other pets as well in the future

**Personality:**

Choose or describe the closest fit:

- Sleepy and comforting
- Mischievous and playful
- Gentle and encouraging
- Curious and magical
- Other:

comforting curious and magical with that whimsical retro vintage game vibes

**What does the pet call the visitor?**

Examples: friend, human, roommate, traveler, or a custom name.

custom name that each user can set for themselves through the website and get their own customized pet(i think we then need to change and tweak our code for the cat itself everytime before letting them download it)

**Does the website speak in the pet's voice?**

- Yes, throughout the website. Because the website is game-like, fairycore,
  and whimsical, every part of the experience should feel like the pet is
  speaking directly to the visitor.

This includes the pet's greetings, buttons, feature descriptions, download
messages, installation guidance, and closing messages. Even technical
information should be written in a friendly, understandable pet voice rather
than switching to a corporate product voice.

Example:

> I will sit quietly in your corner while you work. When you need a little
> company, click me twice and I might give you a happy bounce.

### Desired Feeling

What should visitors feel after seeing the website?

- I want to adopt this little creature.
- This will make my workday nicer.
- This feels like a cozy game.
- This is a charming piece of software.
- Other:
all that's written in here

## Step 2: Define the World

Choose the strongest visual influences:

- Mossy forest clearing
- Enchanted bedroom
- Tiny apothecary
- Old handheld RPG
- 16-bit farming game
- Storybook cottage
- Moonlit garden
- Antique stationery and letters
- Magical computer desktop
- Woodland shrine
- Other:

tree house room where the pet is there maybe with some movements from tree to tree

### Art Direction

**Primary art style:**

- Pixel art
- Illustrated art
- A mixture of pixel art and illustration
- Other: a mixture of pixel art and illustration

**Should the existing pixel pet assets remain the visual center?** yes

**Lighting:**

- Bright and sunlit
- Warm afternoon
- Dusk-like
- Moonlit
- Other: bright sunlit canopy themed..lots of tree houses around

**Texture:**

- Handmade and imperfect
- Polished and game-like
- A mixture of both

mixture of both

## Step 3: Define the Visitor Journey

Choose the intended homepage experience:

- Direct download landing page
- Atmospheric introduction to the pet
- Product page balancing introduction and download
- Small interactive game-like experience

mixture of 2 and 4

### Recommended Journey

1. The pet notices the visitor.
2. The pet introduces itself.
3. The visitor sees what it can do.
4. The visitor explores a small interactive moment.
5. The visitor chooses their operating system.
6. The visitor downloads the pet.
7. The website explains how to start and says goodbye.

### Journey Decisions

**What should happen when someone first lands on the page?**

The visitor arrives in a bright treehouse canopy. The pet is resting in its
little treehouse room, notices the visitor, and moves closer to greet them.
The pet invites the visitor to choose a name for it and a name for themselves.
The page should feel like entering the pet's world rather than opening a
traditional software landing page.

**What should the main call-to-action say?**

**Invite me home**

Examples:

- Adopt your desktop buddy
- Bring them home
- Invite a little friend in
- Download Desktop Buddy
- Other:

**Should the visitor be able to interact with the pet before downloading?**

Yes. The visitor should be able to greet the pet, click or hover to see a
small reaction, choose both names, and explore a small part of the treehouse
world. The interaction should be short and welcoming, not a full game that
delays the download.

After the visitor chooses the names, the pet opens a small download chest and
asks which operating system the visitor uses. The pet then guides them through
the download and installation.

The closing message should feel personal, for example:

> I will be waiting in your corner of the world. Come visit me whenever you
> need a little company.

## Step 4: Website Features

Mark each feature as `Keep`, `Maybe`, or `Later`.

| Feature | Decision | Notes |
| --- | --- | --- |
| Pet-led hero section | Keep | The visitor enters the pet's treehouse canopy. |
| Pet greeting in its own voice | Keep | Every section should sound like the pet is speaking. |
| Primary download action | Keep | Use the pet-led phrase `Invite me home`. |
| Operating-system detection | Keep | Show the relevant download option first. |
| Windows download | Keep | This is the first supported desktop release. |
| macOS download | Later | Add when a macOS build is available. |
| Linux download | Later | Add when a Linux build is available. |
| Animated pet preview | Keep | Reuse the existing pixel pet assets. |
| Feature overview | Keep | Explain reminders, work mode, drinks, sleep, and interaction. |
| Interactive pet demo | Keep | Keep it short: greet, hover, click, and name the pet. |
| Screenshots or desktop scenes | Keep | Show the pet living on the user's desktop. |
| Installation instructions | Keep | Explain setup clearly in the pet's voice. |
| Version and release notes | Maybe | Useful near the download, but not part of the first visual experience. |
| FAQ | Maybe | Add only if visitors have recurring questions. |
| Feedback or community link | Later | Add after the first release and user feedback. |
| Newsletter or update signup | Later | Avoid asking for contact details before validating the product. |
| Reduced-motion support | Keep | Respect visitors who prefer less animation. |

### Recommended First Version

The first version should probably contain:

- Hero and pet introduction
- Feature overview
- Download section
- Installation guidance
- Personality-driven closing section

We should not build every possible feature before validating the core experience.

## Step 5: Moodboard Exercise

Complete this before choosing the final layout.

**Visual references:**

1. tree house room
2. canopy 
3. warm sunlight

**Three colors:**

1. green(all shades light dark sap)
2. yellow
3. warm beige

**Two font styles:**

1. pixelated 
2. game style retro

**Five descriptive words:**

1. cozy
2. whisical
3. fairycore
4. game like
5. retro vintage

**Atmosphere sentence:**

> A warm, sunlit treehouse in the canopy where a tiny magical companion waits
> to be named and invited onto your desktop.

## Step 6: Creative Brief

Complete this after the previous sections are decided.

**One-sentence website concept:**

> fairycore retro vintage game whimsical pet cat to be discovered and brought home by the user

**Target visitor:** any user who likes a lil something creative to keep them copany and remind them from time to time

**Primary visitor action:** they are gonna get involved in the introduction to their pet through a story line that we are gonna set and discover their featres and get to take them home while customizing them

**Pet personality in three words:** whimsical cozy caring

**World or setting:**

An interconnected group of bright treehouses high in a leafy forest canopy.
The visitor enters the pet's cozy room, with little paths, platforms, leaves,
and tree-to-tree movement suggesting a larger magical world beyond the page.

**Art direction:**

A mixture of pixel art and warm illustrated scenery. The existing pixel cat
assets remain the visual center, while illustrated treehouses, leaves, wooden
details, sunlight, and small fairycore decorations create the surrounding
world. The result should feel handmade but still like a polished retro game.

**Color direction:**

Use layered forest greens as the main palette, from deep leafy green to light
canopy green. Use warm yellow for sunlight, highlights, and moments of magic.
Use warm beige for paper, wood, panels, and readable backgrounds. Colors should
feel sunlit and natural rather than neon or overly saturated.

**Typography direction:**

Use a readable typeface for longer explanations and installation guidance.
Use a pixelated or retro game-style typeface for headings, labels, buttons,
status messages, and decorative details. Typography should feel like a cozy
vintage game without making the website difficult to read.

**Texture and surface treatment:**

Combine polished game-like layout elements with handmade surfaces: soft paper,
wood grain, leaves, canvas, subtle pixel patterns, and imperfect illustrated
edges. Textures should add warmth and depth without reducing readability or
making the interface feel cluttered.

**Animation direction:**

Use gentle, purposeful animation. The pet can blink, wave, bounce, wander,
notice the visitor, and move between small treehouse areas. Leaves can sway,
sunlight can shimmer, and small magical details can drift slowly in the
background. Interactions should feel responsive but calm, with reduced-motion
support for visitors who prefer less animation.

**Things the website must avoid:**

- A generic software landing page
- Corporate, sterile, or overly minimal visual language
- Dark fantasy that conflicts with the bright sunlit canopy
- Excessive neon colors or visual noise
- Long blocks of difficult-to-read pixel-font text
- Animations that distract from the pet or slow down the download
- Pretending that macOS or Linux downloads exist before they are supported
- Requiring a separate application build for every user's pet name

## Decisions Log

Record decisions here as they are finalized.

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-15 | Pet is a cat; other species may be added in the future | Current product only has cat assets; keeps the door open without promising more. |
| 2026-10-15 | Pet personality: comforting, curious, magical, whimsical | Matches the fairycore retro vintage game world and drives the site's tone. |
| 2026-10-15 | Visitors name the pet and choose what the pet calls them | Makes each adoption feel personal. |
| 2026-10-15 | Names are personalization details in the downloaded app, not a separate build per user | Avoids rebuilding/recompiling the app for every visitor's name choice. |
| 2026-10-15 | Entire website speaks in the pet's voice | The site is game-like and whimsical; a corporate voice would break immersion. |
| 2026-10-15 | World: bright sunlit treehouse canopy with interconnected treehouses | Strongest visual concept chosen from the moodboard; supports pet movement and story scenes. |
| 2026-10-15 | Art style: mixture of pixel art and illustration | Existing pixel cat stays the visual center; illustrated scenery builds the world around it. |
| 2026-10-15 | Existing pixel pet assets remain the visual center | Reuses proven assets and keeps the website visually consistent with the app. |
| 2026-10-15 | Homepage: atmospheric introduction plus a small interactive game-like moment (mixture of options 2 and 4) | Immersive first impression without delaying the download. |
| 2026-10-15 | Main CTA: "Invite me home" | Feels like adoption rather than a software download. |
| 2026-10-15 | Visitors can interact before downloading: greet, hover/click reactions, naming, light exploration | Short and welcoming; does not become a full game. |
| 2026-10-15 | Windows download first; macOS and Linux later | Windows is the first supported desktop release; avoids advertising unavailable builds. |
| 2026-10-15 | OS detection shows the relevant download option first | Reduces friction at the download chest. |
| 2026-10-15 | Palette: layered forest greens, warm yellow, warm beige | Sunlit, natural fairycore feel; avoids neon and dark fantasy. |
| 2026-10-15 | Typography: pixel/retro game font for headings and labels, readable font for body | Cozy vintage game feel without hurting readability. |
| 2026-10-15 | Texture: mixture of polished game-like layout and handmade surfaces | Warmth and depth without clutter. |
| 2026-10-15 | Gentle, purposeful animation; reduced-motion support | The site should feel alive but calm and accessible. |
| 2026-10-15 | Opening is a guided six-scene story (arrival, meeting, exploring, taking home, getting started, goodbye), not an open game | Visitor watches the world unfold; interaction is reserved for naming, OS choice, and download. |
| 2026-10-15 | First version scope: hero/story, feature overview, download, install guidance, closing message | Validate the core experience before adding FAQ, community, or newsletter. |
| 2026-10-15 | Version/release notes and FAQ are deferred (Maybe); community and newsletter are Later | Not needed for the first visual experience or before release feedback. |

## Implementation Rule

No website code should be written until the creative brief, first-version feature list, and homepage direction have been reviewed and approved.

## Step 7: Website Storyboard

This opening is a guided story, not a fully interactive game. The visitor
watches the world unfold from a first-person perspective. Interaction should be
used only when it supports the story, especially when naming the pet and
starting the download.

### 1. Arrival

**Visual:**

The visitor sees a leafy canopy and a narrow path between the trees. The
branches gently move aside as if the forest has noticed them. The path speeds
forward and reveals a cluster of treehouses in the sunlight. The view moves
toward one small treehouse room.

**Pet action:**

The pet is sitting with its back turned, looking out over the canopy. When the
visitor reaches the room, it pauses, turns around, faces the visitor, and gives
a small meow.

**Pet dialogue:**

> Oh! There you are. I was hoping you would find your way here.

**Visitor action:**

The visitor watches the scene. A subtle continue control or scroll gesture
moves the story forward, but the surrounding treehouse is not an interactive
game environment yet.

### 2. Meeting the Pet

**Visual:**

The pet comes closer and sits beside a small wooden sign or blank name tag.
Warm light falls across the room while the pet waits patiently.

**Pet action:**

The pet introduces itself as a companion who can live on the visitor's desktop,
keep them company, and offer gentle reminders throughout the day.

**Pet dialogue:**

> I do not have a name yet. Perhaps you could give me one?

**Visitor action:**

The visitor enters the pet's name and chooses what the pet should call them.
The pet repeats both names in a short confirmation message. These choices are
personalization details for the downloaded app, not a separate app build for
each visitor.

### 3. Exploring the Treehouse

**Visual:**

The story briefly moves through the treehouse room and shows the pet settling
into its new home. Small visual moments reveal a water cup, a desk, a moonlit
sleeping nook, and a reminder note pinned to the wall.

**Pet action:**

The pet demonstrates its everyday purpose through a short sequence: it takes a
drink, sits beside the visitor while they work, rests when it is tired, and
leaves a reminder note.

**Pet dialogue:**

> I can keep you company, remind you to look after yourself, and rest beside
> you when the day feels long.

**Visitor action:**

The visitor watches the feature sequence. They may hover over a small number of
feature labels for extra explanation, but they do not need to click every item
or control the story.

### 4. Taking the Pet Home

**Visual:**

The pet leads the visitor to a little wooden download chest. The chest opens to
show a warm glowing download button, as if the visitor is being invited to take
the pet's home with them.

**Pet dialogue:**

> My room is ready. Would you like to invite me home?

**Visitor action:**

The visitor chooses their operating system. The website shows the appropriate
download option, currently Windows, and lets the visitor confirm the pet's name
and their own name before downloading.

### 5. Getting Started

**Visual:**

The pet opens a small illustrated instruction card beside the download chest.
The page remains inside the treehouse world instead of switching to a detached
technical help page.

**Pet dialogue:**

> Once I arrive, open the installer and follow the little trail of steps. Then
> I will find a cozy corner on your desktop.

**Visitor action:**

The visitor receives three clear steps:

1. Download the installer.
2. Open it and follow the installation prompts.
3. Launch Desktop Buddy and meet the pet on the desktop.

The page also explains that the pet can be moved, interacted with, and
customized after launch.

### 6. Goodbye

**Visual:**

The pet returns to the edge of its treehouse and looks out toward the path. A
small trail of light travels from the treehouse toward the download button.

**Pet dialogue:**

> I will be waiting in your corner of the world. Come visit me whenever you
> need a little company.

**Visitor action:**

The visitor can download the pet again if needed, read the installation guide,
or return to the beginning of the story. A future version may include feedback
or community links, but these are not required for the first release.

### Interaction Boundary

The website should feel alive through animation, camera movement, pet behavior,
and story progression. It should not require the visitor to discover or click
every object. The meaningful interactions for the first version are:

- Moving through the story
- Naming the pet
- Choosing what the pet calls the visitor
- Choosing an operating system
- Starting the download
