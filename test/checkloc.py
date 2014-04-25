#
#   Copyright (C) 2011 Dave Schaefer
#
#   This program is free software: you can redistribute it and/or modify
#   it under the terms of the GNU General Public License as published by
#   the Free Software Foundation, version 3 of the License.
#
#   This program is distributed in the hope that it will be useful,
#   but WITHOUT ANY WARRANTY; without even the implied warranty of
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#   GNU General Public License for more details.
#
#   You should have received a copy of the GNU General Public License
#   along with this program.  If not, see <http://www.gnu.org/licenses/>.


"""
Validate Mozilla-style localization files to make sure all localizations
have the same keys in the same places.

Current test cases for each localization:
	- Loc has no extra files
	- Loc has no missing files
	- Loc has at least one key
	- Loc has no extra keys
	- Loc has no missing keys
	- Loc has no duplicate keys defined in the same .properties file
	(the same key name defined in different files is okay -
	 presumably they will be loaded and used in different stringbundles)
	- Key values are not empty
	- Key names contain no invalid characters, including "!@#$%^&*<>[](){} ?
	- DTD values contain no invalid characters, including "%<
	- DTD comments contain no double hyphens '--'
	- .properties values are valid, meaning either:
		1. no % on a line
		2. double %% to escape and print a regular %
		3. %S or %n$S , where n is a number, for formatted string replacement.
	- No files contain the Byte Order Marker (BOM)

Unimplemented:
	- Test that loc has no duplicate DTD entities defined in the same file
	(currently an lxml limitation; lxml removes duplicate entities when parsing.
	but so does firefox, so the built plugin will still be valid.
	this test would simply be a warning for builders, as it's probably not what	they intended).

Feel free to add more tests!
"""

import argparse
import codecs
import logging
import os
import re
import sys

try:
	from lxml import etree
except ImportError:
	logging.warning("python lxml library not found; localization tests cannot be run. Please install the python 'lxml' library to run localization tests.")
	sys.exit(0)


# When storing localization strings,
# use 'filename/keyname' as the hash key, as that's the value
# we want to ensure is unique for each localization.
# We want to make sure there are no instances of the separator character inside the filename,
# so we don't have trouble parsing or splitting the hash key later, if necessary
# (e.g. for printing error info)
# Thus, use a separator character that is *not*
# a legal filename character on most systems (including windows, linux, and osx).
# This makes it easier to ensure we won't encounter it in file names
# or have difficulty printing error info.
LSEP = '/'

# the en-US translation will have all files and strings created. Use it as the base.
BASE_LOC = 'en-US'

# .properties files look like:
#   #comments are ignored
#   name=string
# Assumptions: both comments and entries exist only on a single line.
PROP_COMMENT = re.compile('#+[^\n\r\f]*[\n\r\f]', re.DOTALL)
PROP_SEP = re.compile('[\n\r\f]')
PROP_LINE = re.compile('([A-Za-z0-9]+)=([^\n\r\f]*)')

DTD_PARSE_ERROR = re.compile('([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):(.*)', re.DOTALL)

any_errors = False


def _log_error(msg):
	"""Log an error message."""
	# this function wraps setting the global error flag
	# to keep all error code in one place
	global any_errors

	any_errors = True
	logging.error(msg)

def _extract_dtd_parse_error_info(err):
	"""
	Extract the line and column numbers from a DTDParseError,
	so the user knows where to look for the problem
	without having to understand the built-in error format.
	"""
	# error_log lines are formatted like:
	# <string>:10:17:FATAL:PARSER:ERR_VALUE_REQUIRED: Entity value required
	line = str(err.error_log[-1]).strip()
	match = re.match(DTD_PARSE_ERROR, line)
	if (match):
		(string, line, column, errlevel, place, errname, message) = match.groups()
		return "Syntax error starting at Line {0}, Col {1}: {2}\n{3}".format(\
			line, column, err.message, err.error_log)

def _get_loc_keys(loc_dir):
	"""
	Read the localization string keys and values from all files in a directory
	and return them as a dictionary.

	This function only reads data from Mozilla-style localization files:
	XML DTD and .properties files.
	"""
	loc_files = []
	keys = {}

	# we assume that loc directries do not have sub-directories
	for (root, dirs, files) in os.walk(loc_dir):
		loc_files.extend(files)

	logging.info("Checking files in {0}".format(loc_dir))
	for file_name in files:
		file_path = os.path.normpath(os.path.join(loc_dir, file_name))
		file_name = file_name.replace(LSEP, '')

		# check each file for the Byte Order Marker;
		# according to the MDN spec, localization files should *not* contain BOM
		# https://developer.mozilla.org/en/XUL_Tutorial/Localization
		bytes = min(32, os.path.getsize(file_path))
		with open(file_path, 'rb') as rawfile:
			if rawfile.read(bytes).startswith(codecs.BOM_UTF8):
				_log_error("File '{0}' contains Byte Order Marker; localization files should not contain BOM."\
					.format(file_path))

		if (file_path.endswith('.dtd')):
			with open(file_path, 'r') as openfile:
				try:
					dtd = etree.DTD(openfile)
					for entity in dtd.entities():
						# note: lxml actually removes duplicate entities when parsing;
						# it always takes the first entry.
						key = file_name + LSEP + entity.name
						if key in keys:
							_log_error("Duplicate dtd key '{0}' found in {1}".format(\
								key, file_path))
						elif len(entity.content) < 1:
							_log_error("Key '{0}' in {1} has a blank value".format(\
								key, file_path))
						# check for invalid content
						# lxml will already check for '%' in values when it parses the file
						elif '<' in entity.content:
							_log_error("The value for '{0}' in {1} contains the invalid character '<'. This is not allowed; please remove this character.".format(\
								key, file_path))
						else:
							keys[key] = entity.content

				except (etree.DTDParseError) as ex:
					_log_error("Error: could not parse {0}: {1}".format(\
						file_path, _extract_dtd_parse_error_info(ex)))

		elif (file_path.endswith('.properties')):
			keys = _parse_properties_file(keys, file_path)
		else:
			# not neccesarily a failure - there may just be extra files lying around.
			logging.warning("File {0} is not a .dtd or .properties file. Ignoring.".format(file_path))

	return keys

def _parse_properties_file(keys, file_path):
	"""
	Extract localization string keys and values from a mozilla-style ".properties" file
	https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Tutorial/Property_Files
	"""
	file_name = os.path.basename(file_path).replace(LSEP, '')

	with open(file_path, 'r') as openfile:
		data = openfile.read()

		if (len(data) < 1):
			raise AssertionError("{0} does not contain any lines".format(file_path))

		data = re.sub(PROP_COMMENT, '', data)
		data = re.split(PROP_SEP, data)
		for line in data:
			match = PROP_LINE.match(line)
			if (match):
				key = file_name + LSEP + match.group(1)
				value = match.group(2)
				if key in keys:
					_log_error("Duplicate property key '{0}' found in {1}".format(\
						key, file_path))
				elif len(value) < 1:
					_log_error("Key '{0}' in {1} has a blank value".format(\
						key, file_path))
				# the only special character for .properties files is %
				# used to substitute values when calling strbundle.getFormattedString().
				# https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Tutorial/Property_Files#Text_Formatting
				# there are three valid options:
				# 1. no % on a line
				# 2. %% to escape and print a regular %
				# 3. %S or %n$S , where n is a number
				elif '%' in value:
					valid = True
					x = value.find('%')
					while x < len(value) and x != -1:
						# we don't save the (n$) group for anything;
						# we simply specify a group so we can make the entire group optional
						# with a trailing ?
						pmatch = re.match('%([0-9]+\$)?S', value[x:])

						if (x + 1 < len(value)) and value[x+1] == '%':
							x += 1 # double %% for escape sequence; print actual %
						elif pmatch:
							# advance 1 char for the trailing S
							# plus however many chars make up the numerical reference (if any)
							x += 1
							if pmatch.group(1):
								x += len(pmatch.group(1))
						else:
							_log_error("key '{0}' contains improper use of % in {1}. Position marked by ^ below:\n{2}\n{3}".format(\
								key, file_path, value, "{0}^".format(" " * x)))
							valid = False
							break

						x = value.find('%', x+1)

					if valid:
						keys[key] = value

				else:
					keys[key] = value
			elif len(line) > 0: # not an empty string
				_log_error("line '{0}' does not match any patterns for {1}".format(\
					line, file_path))

		return keys


def validate_loc_files(loc_dir):
	"""Validate localization contents."""
	global any_errors
	any_errors = False

	langs = {}
	langfiles = {}
	baseline = {}
	baseline['files'] = []

	print "Starting Localization tests..."

	loc_dir = os.path.join(os.path.dirname(os.path.realpath(__file__)), loc_dir)
	if not (os.path.exists(loc_dir)):
		raise AssertionError("The localization directory {0} does not exist!".format(loc_dir))
	logging.info("Loc directory {0} exists.".format(loc_dir))

	if not (os.path.isdir(loc_dir)):
		raise AssertionError("{0} is not a directory!".format(loc_dir))
	logging.info("{0} is a directory.".format(loc_dir))

	for (root, dirs, files) in os.walk(loc_dir):
		for dir in dirs:
			langs[dir] = True
		langfiles[os.path.basename(root)] = files

	if (len(langs) < 1):
		raise AssertionError("Did not find any language folders inside {0}!".format(loc_dir))
	print "Found {0} languages: {1}.".format(len(langs), langs.keys())

	if BASE_LOC not in langs:
		raise AssertionError("Base language folder '{0}' was not found in {1}".format(\
			BASE_LOC, loc_dir))

	baseline['name'] = BASE_LOC
	baseline['files'].extend(langfiles[baseline['name']])
	del langs[BASE_LOC] # don't test the baseline localization against itself

	if (len(baseline['files']) < 1):
		raise AssertionError("Did not find any files in '{0}'!".format(baseline['name']))

	baseline['keys'] = _get_loc_keys(os.path.join(loc_dir, baseline['name']))

	if (any_errors):
		return True # error message has already been printed above

	print "{0} keys found in baseline '{1}'.".format(\
		len(baseline['keys']), baseline['name'])

	for lang in langs:
		keys = _get_loc_keys(os.path.join(loc_dir, lang))

		for key in keys:
			if (key not in baseline['keys']):
				_log_error("Key '{0}' in '{1}' but not in '{2}'".format(\
					key, lang, baseline['name']))

		for key in baseline['keys']:
			if (key not in keys):
				_log_error("Key '{0}' in '{1}' but not in '{2}'".format(\
					key, baseline['name'], lang))

	print "Done!"
	return any_errors


if __name__ == '__main__':
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument('loc_dir',
			help="Directory where Mozilla-style localization files are located.")
	parser.add_argument('--verbose', '-v', default=False, action='store_true',
			help="Verbose mode. Print more info about files and tests.")

	args = parser.parse_args()

	loglevel = logging.WARNING
	if (args.verbose):
		loglevel = logging.INFO

	logging.basicConfig(format='%(levelname)s: %(message)s', level=loglevel)
	errors = validate_loc_files(args.loc_dir)
	if (errors):
		sys.exit(1)
	else:
		sys.exit(0)
