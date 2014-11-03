# Translating Perspectives

Do you speak a language other than English? Are you willing to donate some time translating English sentences? **Great!**

Perspectives needs both:
* Translations to new languages
* Translating English that remains in the current languages

We're willing to work with you to make translation as easy as possible. Here are some options for how you can help translate Perspectives.



##Options for translating

### Use Babelzilla:

1. Sign up at http://www.babelzilla.org
2. [Visit the Perspectives WTS page](http://www.babelzilla.org/index.php?option=com_wts&extension=5614&type=show)
3. Sign up for your language and use the Babelzilla tools to translate!

If you have questions:
* [Email us on the Perspectives mailing list](https://groups.google.com/group/perspectives-dev)
* Or post in the [Babelzilla Perspectives thread](http://www.babelzilla.org/forum/index.php?showtopic=7172&st=0)


### Use GitHub

1. Fork the [Perspectives project on GitHub](https://github.com/danwent/Perspectives):
	1. Sign in to GitHub
	2. Click the 'Fork' button in the top right
2. Edit the translation files inside [plugin/chrome/locale](plugin/chrome/locale):
	1. If needed, create a new folder in plugin/chrome/locale and copy over the ```.dtd``` and ```.properties``` files from the en-US locale
	3. Translate the strings inside each file
3. Send a pull request


### Use email

1. [View the strings on GitHub](https://github.com/danwent/Perspectives/tree/master/plugin/chrome/locale/en-US) and email us your translations. We can use them to create a new locale.


### Other

Prefer to work via IM? Encrypted email? Carrier pidgeon? Just [let us know](https://groups.google.com/group/perspectives-dev) and we can help!


##Useful Links

* [List of recognized Firefox locales](https://wiki.mozilla.org/L10n:Teams)
* [Mozilla Developer Guide to Localization](https://developer.mozilla.org/en/Localization) (or change the URL for your language)
* [How to test locales](http://www.babelzilla.org/forum/index.php?showtopic=1384) (and see ```test/Testing Localizations.txt``` in the Perspectives git)

## Questions

If you have any questions please [email us and ask](https://groups.google.com/group/perspectives-dev).


-------

## For Perspectives developers:

###How to publish a new localization

0. Make sure all ```.dtd``` and ```.properties``` files are saved as UTF-8 with no BOM. Otherwise many things fail horribly. The python unit tests should detect this and fail any builds that don't match, so be sure to install python.

1. Before publishing a release, register the new locale inside ```chrome.manifest```. e.g.

 ```locale perspectives fr chrome/locale/fr/```

 Don't forget the trailing slash!

2. Write a line for the locale inside ```install.rdf```:

 ```<locale> perspectives/locale/fr-FR/</locale>```

 Adding a ```<Description>``` block with a ```<em:translator>translator name</em:translator>``` credit is a good thing.
Also ask your translator nicely to translate the 'description' and 'creator' fields.

3. Make sure to save the file as as UNIX/UTF-8 encoding.

4. Add a credit inside ```plugin/chrome/content/credits/translators.txt``` (or a credit to 'anonymous', if the translator prefers)

