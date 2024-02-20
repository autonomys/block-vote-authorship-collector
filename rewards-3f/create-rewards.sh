#!/bin/bash

# Check if two arguments were provided
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 CSV_PATH OUTPUT_CSV_PATH"
  exit 1
fi

# Define variables
INPUT_CSV_PATH="$1"
OUTPUT_CSV_PATH="$2"
TEMP_PATH="temp.csv"

# Remove carriage returns if they exist and create a temporary cleaned file
tr -d '\r' < "$INPUT_CSV_PATH" > "$TEMP_PATH"

# Process the cleaned CSV, skip the header, and group by `reward_address`.
# Multiply the count by 0.1 and print with a comma separator.
# Create the output file and write the header
echo "reward_address,rewards" > $OUTPUT_CSV_PATH

# Process the CSV, skip the header, group by `reward_address`,
# multiply count by 0.1, and append the sorted results to the output file
awk -F, 'NR > 1 {counts[$3] += 0.1} END {for (reward_address in counts) print reward_address "," counts[reward_address]}' $TEMP_PATH | sort -t, -k2,2nr >> $OUTPUT_CSV_PATH

# Remove the temporary file
rm "$TEMP_PATH"

# Output the path to the new file
echo "Processed data output to $OUTPUT_CSV_PATH"