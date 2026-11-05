-- Tally sells TDL/TCP add-ons, not books. New rows default to TDL; add-ons that have no uploaded file yet follow.
alter table books alter column file_format set default 'TDL';
update books set file_format = 'TDL' where file_format = 'PDF' and file_url is null;
