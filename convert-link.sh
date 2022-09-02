#!/bin/env bash

sed -i -e 's@\[\([^\]*\)](\([^\)]*\))@<a class="visible-link" href=\2>\1</a>@g' $1
