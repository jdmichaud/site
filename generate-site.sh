#!/usr/bin/env bash

# Go through all the articles and generates:
# - the index
# - each article

function printusage {
  echo "Usage: $0"
  echo ""
  echo "Example:"
  echo "       $0"
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

if [ $# -ne 0 ];
then
  echo "error: Incorrect number of arguments"
  printusage
  exit 1
fi

mkdir -p dist
rm -fr dist/*

# Generate the index
rm -fr index-urls.html
for article in $(ls blog/20[0-9]* | sort -n | tac)
do
  article_url=$(echo $article | sed -e 's/.*\(20[0-9]\{6\}.*\)/\1/')
  article_raw_date=$(echo $article | sed -e 's/.*\(20[0-9]\{6\}\).*/\1/')
  article_date=${article_raw_date:0:4}-${article_raw_date:4:2}-${article_raw_date:6:2}
  article_title=$(cat $article | grep 'class="title"' | sed -e 's/.*class="title">\([^<]*\).*/\1/g')
  # echo $article_date $article_title
  echo '<li><a href="/'${article_url}'"><span class="date">'${article_date}'</span> '${article_title}'</a></li>' >> index-urls.html
done

./generate-article.sh index.html nothing > dist/index.html
rm -fr index-urls.html

# Generate the articles
for article in $(ls blog/20[0-9]* | sort -n | tac)
do
  article_output_file=$(echo $article | sed -e 's@blog/\(.*\)@\1@')
  ./generate-article.sh blog/blog-entry.html ${article} > dist/${article_output_file}
done

./generate-article.sh contact.html nothing > dist/contact.html
./generate-article.sh about.html nothing > dist/about.html

cp -r static/* dist/
cp -r assets dist/
