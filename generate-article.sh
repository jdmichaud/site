#!/usr/bin/env bash

# Takes the template and insert the header and the content of the article.

function printusage {
  echo "Usage: $0 <template> <article>"
  echo ""
  echo "Example:"
  echo "       $0 blog/blog-entry.html blog/some-article"
}

if [[ $# -eq 1 && ( $1 == "--help" || $1 == "-h" ) ]];
then
  echo "$0 - generate an article"
  echo ""
  echo "The template contains variables that will be replaced by values."
  echo "  file content: {{ file: somefile.txt }} is replaced by the content of"
  echo "                somefile.txt"
  echo "  article     : {{ article }} is replaced by the content of the"
  echo "                provided file"
  echo ""
  printusage
  exit 0
fi

if [ $# -ne 2 ];
then
  echo "error: Incorrect number of arguments"
  printusage
  exit 1
fi

sed -e 's/{{ file: \(\S*\) }}/cat \"\1\"/e' -e "s@{{ article }}@cat $2@e" $1

# vim: syntax=bash
