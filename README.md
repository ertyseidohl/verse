# Verse LSP

A language server for poetry / verse.

This is *not* for to the [Verse programming language](https://en.wikipedia.org/wiki/Verse_(programming_language)), but instead for poems written in English.

This was written as a toy project to explore GenAI and the Language Server Protocol (LSP).

By [Erty](https://erty.me)

## Why?

For exploration and fun programming, not as a serious tool for poets.

I think AI-generated poetry is slop, but this idea was rattling around in my head and I wanted to build a VS Code extension, so I put the two together and built this as a portfolio piece.

I want to build something that expands poetry, and doesn't replace it - making it easier for poets to see the rhyme scheme and meter throughout their poem, for example.

## Features

### Current

* Uses Google's [Gemini](https://gemini.google.com) LLM to autogenerate next lines / end of lines.
    * It's ... ok at this. It turns out that LLMs like Gemini only encode semantic meaning as part of their vector, and drop all lexical and pronounciation meaning. So: they're pretty bad at figuring out if words rhyme, or what meter they have.

* Parses the poem and uses the [CMU Rhyming Dict](https://svn.code.sf.net/p/cmusphinx/code/trunk/cmudict/) to attempt to figure out the meter.
    * Warns if you end a line with a stressed syllable, just as an example.

### In-Progress

* Writing an analyzer to (attempt to) determine if the poem has a meter, and then add a warning to any lines that don't match that meter.

* Currently, the parser only considers the first set of phonemes found for a particular word, which is not always correct (e.g. Present (gift) vs Present (now)). Want to fix this by recursively exploring OR tying in an LLM to figure out which one is better.

### Stretch Goals

* Color code the various rhyming phonemes throughout the text, so that you can see the rhymes, assonance, etc. This would apply throughout each line, not only at the end.

* Train my own LLM on poems and (somehow) give it not only semantic meaning but lexical data about the word.

## Installation

This is not currently published on the VS Code extensions repository since it's just a toy project.

You can install it by cloning this repo, running `npm install`, and finally running the `Launch Client` command in `launch.json`, usually bound to `F5`.

This will launch a new copy of VS Code with the extension installed. If you want LLM functionality, add a Gemini API key as described in the next section.

## Usage

Open a file that ends in `.verse` or `.poem`, and write a little. Then hit `cmd+enter` (or `ctrl+enter`). It should think for a bit and then give you some suggestions.

Try writing a line that ends in a stressed syllable and it should pop a tiny info box saying so.

## Extension Settings

This extension has the following settings:

**`verse.geminiApiKey`**

If you want to use the Gemini feature, you'll need to provide a Gemini API key, which you can get [here](https://ai.google.dev/gemini-api/docs/api-key). You may need to set this setting in the new VS Code client that launches with the extension installed.

**`verse.predictorType`**

If you want to use the CMU rhyming dict to predict next words instead of Gemini, you can change this here. I'll warn you that CMU rhyming dict is even worse than Gemini.

**`verse.trace.server`**

Prints debug information about the connection between the LSP client and the LSP server.